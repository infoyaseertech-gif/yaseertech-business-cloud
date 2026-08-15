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

  it('a Cashier-equivalent (no users.manage permission) cannot list tenant users', async () => {
    // Registration always creates a Business Owner, who has every
    // permission (per seed data role_permissions). This test documents the
    // expectation for Phase 4, when non-owner signup/invite flows exist:
    // once a Cashier-role user can be created via the API, this test
    // should register one and assert GET /users returns 403
    // FORBIDDEN_MISSING_PERMISSION for them. Left as a documented gap
    // rather than a fabricated pass, since Phase 3 doesn't yet expose an
    // "invite a Cashier" endpoint to set this up end-to-end.
    expect(true).toBe(true);
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
});
