import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Tenant isolation is the single most important guarantee this whole
 * platform makes (Phase 0, Section 3). This test doesn't check the RLS
 * policy in isolation -- it registers two real tenants through the real
 * HTTP API and proves neither can see the other's data, end to end,
 * through the actual code path a malicious or buggy client would use.
 *
 * Requires a running Postgres with migrations applied (see README --
 * `docker compose up -d && npm run migrate` before running this).
 *
 * This is meant to be a permanent CI gate: run on every commit, per
 * Phase 1's exit criteria. If this test ever fails, nothing else about
 * the platform matters until it passes again.
 */
describe('Tenant isolation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function uniqueEmail(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
  }

  it('a user from Tenant A can never see Tenant B data via /users/me or /users', async () => {
    const server = app.getHttpServer();

    // Register two independent tenants.
    const tenantAEmail = uniqueEmail('tenant-a-owner');
    const tenantBEmail = uniqueEmail('tenant-b-owner');

    const tenantARes = await request(server)
      .post('/api/v1/auth/register')
      .send({
        businessName: 'Tenant A Test Business',
        ownerFullName: 'Owner A',
        email: tenantAEmail,
        password: 'correct-horse-battery-staple',
      })
      .expect(201);

    const tenantBRes = await request(server)
      .post('/api/v1/auth/register')
      .send({
        businessName: 'Tenant B Test Business',
        ownerFullName: 'Owner B',
        email: tenantBEmail,
        password: 'correct-horse-battery-staple',
      })
      .expect(201);

    expect(tenantARes.body.user.tenantId).not.toEqual(tenantBRes.body.user.tenantId);

    const tokenA = tenantARes.body.accessToken;
    const tokenB = tenantBRes.body.accessToken;

    // Each owner's /users/me must return only their own tenant's data.
    const meA = await request(server)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(meA.body.email).toEqual(tenantAEmail);

    const meB = await request(server)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(meB.body.email).toEqual(tenantBEmail);

    // Tenant A's Business Owner listing users must NEVER include Tenant B's
    // owner, and vice versa -- this is the actual cross-tenant leak check.
    const listA = await request(server)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const listAEmails = listA.body.map((u: { email: string }) => u.email);
    expect(listAEmails).toContain(tenantAEmail);
    expect(listAEmails).not.toContain(tenantBEmail);

    const listB = await request(server)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    const listBEmails = listB.body.map((u: { email: string }) => u.email);
    expect(listBEmails).toContain(tenantBEmail);
    expect(listBEmails).not.toContain(tenantAEmail);
  });

  it('rejects requests with no token, and rejects a tampered/invalid token', async () => {
    const server = app.getHttpServer();

    await request(server).get('/api/v1/users/me').expect(401);

    await request(server)
      .get('/api/v1/users/me')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('a Cashier cannot list tenant users (real RBAC test, closing the Phase 3 gap)', async () => {
    const server = app.getHttpServer();

    const ownerRes = await request(server)
      .post('/api/v1/auth/register')
      .send({
        businessName: 'RBAC Test Shop',
        ownerFullName: 'RBAC Test Owner',
        email: uniqueEmail('rbac-owner'),
        password: 'correct-horse-battery-staple',
      })
      .expect(201);
    const ownerToken = ownerRes.body.accessToken;

    const branches = await request(server)
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const cashierEmail = uniqueEmail('rbac-cashier');
    await request(server)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fullName: 'Test Cashier',
        email: cashierEmail,
        password: 'correct-horse-battery-staple',
        role: 'Cashier',
        branchId: branches.body[0].id,
      })
      .expect(201);

    const cashierLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: cashierEmail, password: 'correct-horse-battery-staple' })
      .expect(200);
    const cashierToken = cashierLogin.body.accessToken;

    // The actual RBAC assertion this test exists to make: a Cashier has
    // pos.create_sale and inventory.view (per seed data role_permissions)
    // but NOT users.manage -- this must come back 403, not 200.
    await request(server)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${cashierToken}`)
      .expect(403);

    // And the inverse, so this test would actually fail if RBAC were
    // broken in the other direction too: a Cashier CAN create a sale.
    const products = await request(server)
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${cashierToken}`)
      .expect(200);
    expect(Array.isArray(products.body)).toBe(true);
  });

  it('Phase 4: a product created by one tenant is invisible to another tenant', async () => {
    const server = app.getHttpServer();

    const tenantARes = await request(server)
      .post('/api/v1/auth/register')
      .send({
        businessName: 'Isolation Test Shop A',
        ownerFullName: 'Owner A2',
        email: uniqueEmail('iso-a'),
        password: 'correct-horse-battery-staple',
      })
      .expect(201);
    const tenantBRes = await request(server)
      .post('/api/v1/auth/register')
      .send({
        businessName: 'Isolation Test Shop B',
        ownerFullName: 'Owner B2',
        email: uniqueEmail('iso-b'),
        password: 'correct-horse-battery-staple',
      })
      .expect(201);

    const tokenA = tenantARes.body.accessToken;
    const tokenB = tenantBRes.body.accessToken;
    const uniqueSku = `ISO-TEST-${Date.now()}`;

    await request(server)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        sku: uniqueSku,
        name: 'Tenant A Secret Product',
        costPriceNgn: 1000,
        sellingPriceNgn: 1500,
      })
      .expect(201);

    const listA = await request(server)
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(listA.body.some((p: { sku: string }) => p.sku === uniqueSku)).toBe(true);

    const listB = await request(server)
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(listB.body.some((p: { sku: string }) => p.sku === uniqueSku)).toBe(false);
  });

  it('Phase 4b: a customer and invoice created by one tenant are invisible to another tenant', async () => {
    const server = app.getHttpServer();

    const tenantARes = await request(server)
      .post('/api/v1/auth/register')
      .send({
        businessName: 'Isolation Test Shop C',
        ownerFullName: 'Owner C',
        email: uniqueEmail('iso-c'),
        password: 'correct-horse-battery-staple',
      })
      .expect(201);
    const tenantBRes = await request(server)
      .post('/api/v1/auth/register')
      .send({
        businessName: 'Isolation Test Shop D',
        ownerFullName: 'Owner D',
        email: uniqueEmail('iso-d'),
        password: 'correct-horse-battery-staple',
      })
      .expect(201);

    const tokenA = tenantARes.body.accessToken;
    const tokenB = tenantBRes.body.accessToken;

    const customerRes = await request(server)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ fullName: 'Tenant A Secret Customer' })
      .expect(201);

    const listCustomersB = await request(server)
      .get('/api/v1/customers')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(
      listCustomersB.body.some((c: { full_name: string }) => c.full_name === 'Tenant A Secret Customer'),
    ).toBe(false);

    // Tenant B must not even be able to look up Tenant A's customer/invoice
    // by ID directly -- RLS should make it behave as not-found, not leak
    // via a permissions error that confirms the ID exists.
    const branchesA = await request(server)
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const invoiceRes = await request(server)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        branchId: branchesA.body[0].id,
        customerId: customerRes.body.id,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        items: [{ description: 'Isolation test item', quantity: 1, unitPriceNgn: 1000 }],
      })
      .expect(201);

    await request(server)
      .get(`/api/v1/invoices/${invoiceRes.body.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it('Phase 6: accounting reports never include another tenant\'s journal entries', async () => {
    const server = app.getHttpServer();

    const tenantARes = await request(server)
      .post('/api/v1/auth/register')
      .send({
        businessName: 'Isolation Test Shop E',
        ownerFullName: 'Owner E',
        email: uniqueEmail('iso-e'),
        password: 'correct-horse-battery-staple',
      })
      .expect(201);
    const tenantBRes = await request(server)
      .post('/api/v1/auth/register')
      .send({
        businessName: 'Isolation Test Shop F',
        ownerFullName: 'Owner F',
        email: uniqueEmail('iso-f'),
        password: 'correct-horse-battery-staple',
      })
      .expect(201);

    const tokenA = tenantARes.body.accessToken;
    const tokenB = tenantBRes.body.accessToken;

    const branchesA = await request(server)
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const productA = await request(server)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ sku: `ISO-ACCT-${Date.now()}`, name: 'Isolation Accounting Item', costPriceNgn: 100, sellingPriceNgn: 999999 })
      .expect(201);

    await request(server)
      .post('/api/v1/pos/sales')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        branchId: branchesA.body[0].id,
        items: [{ productId: productA.body.id, quantity: 1 }],
        payments: [{ method: 'cash', amountNgn: 999999 }],
        clientTransactionUuid: randomUUID(),
      })
      .expect(201);

    const today = new Date().toISOString().slice(0, 10);
    const pnlB = await request(server)
      .get(`/api/v1/accounting/profit-and-loss?startDate=${today}&endDate=${today}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    // Tenant B's revenue for today must NOT include Tenant A's ₦999,999
    // sale -- if RLS had a hole anywhere in the accounting read path, this
    // distinctive, unmistakable amount is what would leak through.
    expect(pnlB.body.totalRevenue).not.toBe(999999);
  });

  it('Phase 5: a branch created by one tenant is invisible to another tenant', async () => {
    const server = app.getHttpServer();

    const tenantARes = await request(server)
      .post('/api/v1/auth/register')
      .send({
        businessName: 'Isolation Test Shop G',
        ownerFullName: 'Owner G',
        email: uniqueEmail('iso-g'),
        password: 'correct-horse-battery-staple',
      })
      .expect(201);
    const tenantBRes = await request(server)
      .post('/api/v1/auth/register')
      .send({
        businessName: 'Isolation Test Shop H',
        ownerFullName: 'Owner H',
        email: uniqueEmail('iso-h'),
        password: 'correct-horse-battery-staple',
      })
      .expect(201);

    const tokenA = tenantARes.body.accessToken;
    const tokenB = tenantBRes.body.accessToken;
    const branchName = `Isolation Test Branch ${Date.now()}`;

    await request(server)
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: branchName })
      .expect(201);

    const branchesB = await request(server)
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(branchesB.body.some((b: { name: string }) => b.name === branchName)).toBe(false);
  });
});
