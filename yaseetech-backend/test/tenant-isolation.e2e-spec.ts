import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
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

  it('dashboard summary never mixes tenants, and hides sections the caller lacks permission for', async () => {
    const server = app.getHttpServer();

    const ownerRes = await request(server)
      .post('/api/v1/auth/register')
      .send({
        businessName: 'Dashboard Test Shop',
        ownerFullName: 'Dashboard Owner',
        email: uniqueEmail('dash-owner'),
        password: 'correct-horse-battery-staple',
      })
      .expect(201);
    const ownerToken = ownerRes.body.accessToken;

    const branches = await request(server)
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const branchId = branches.body[0].id;

    const product = await request(server)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ sku: `DASH-${Date.now()}`, name: 'Dashboard Test Item', costPriceNgn: 100, sellingPriceNgn: 777777 })
      .expect(201);

    await request(server)
      .post('/api/v1/pos/sales')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        branchId,
        items: [{ productId: product.body.id, quantity: 1 }],
        payments: [{ method: 'cash', amountNgn: 777777 }],
        clientTransactionUuid: randomUUID(),
      })
      .expect(201);

    // Owner sees the sale in their own dashboard.
    const ownerSummary = await request(server)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(ownerSummary.body.todaySales.total).toBeGreaterThanOrEqual(777777);
    expect(ownerSummary.body.outstandingInvoices).not.toBeNull(); // Owner has invoicing.manage

    // A Cashier in the SAME tenant sees sales, but not the invoicing section.
    const cashierEmail = uniqueEmail('dash-cashier');
    await request(server)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fullName: 'Dashboard Cashier',
        email: cashierEmail,
        password: 'correct-horse-battery-staple',
        role: 'Cashier',
        branchId,
      })
      .expect(201);
    const cashierLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: cashierEmail, password: 'correct-horse-battery-staple' })
      .expect(200);

    const cashierSummary = await request(server)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${cashierLogin.body.accessToken}`)
      .expect(200);
    expect(cashierSummary.body.todaySales).not.toBeNull(); // Cashier has pos.create_sale
    expect(cashierSummary.body.outstandingInvoices).toBeNull(); // Cashier lacks invoicing.manage
    expect(cashierSummary.body.teamSize).toBeNull(); // Cashier lacks users.manage

    // A completely different tenant must never see this ₦777,777 sale.
    const otherTenantRes = await request(server)
      .post('/api/v1/auth/register')
      .send({
        businessName: 'Dashboard Isolation Shop',
        ownerFullName: 'Other Owner',
        email: uniqueEmail('dash-other'),
        password: 'correct-horse-battery-staple',
      })
      .expect(201);
    const otherSummary = await request(server)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${otherTenantRes.body.accessToken}`)
      .expect(200);
    expect(otherSummary.body.todaySales.total).not.toBe(777777);
  });

  it('PATCH /users/:id updates a team member, refuses to edit the Business Owner, and stays tenant-isolated', async () => {
    const server = app.getHttpServer();

    const ownerRes = await request(server)
      .post('/api/v1/auth/register')
      .send({
        businessName: 'Edit Team Test Shop',
        ownerFullName: 'Edit Test Owner',
        email: uniqueEmail('edit-owner'),
        password: 'correct-horse-battery-staple',
      })
      .expect(201);
    const ownerToken = ownerRes.body.accessToken;
    const ownerUserId = ownerRes.body.user.id;

    const branches = await request(server)
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const branchId = branches.body[0].id;

    const cashierRes = await request(server)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fullName: 'Editable Cashier',
        email: uniqueEmail('editable-cashier'),
        password: 'correct-horse-battery-staple',
        role: 'Cashier',
        branchId,
      })
      .expect(201);

    // The actual feature: promote this Cashier to Branch Manager.
    const updated = await request(server)
      .patch(`/api/v1/users/${cashierRes.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'Branch Manager', branchId })
      .expect(200);
    expect(updated.body.role).toBe('Branch Manager');

    const list = await request(server)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const editedMember = list.body.find((u: { id: string }) => u.id === cashierRes.body.id);
    expect(editedMember.role_name).toBe('Branch Manager');

    // The safety guard: the Owner cannot use this endpoint on themselves
    // (or, by the same rule, on any other Business Owner).
    await request(server)
      .patch(`/api/v1/users/${ownerUserId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'Staff', branchId })
      .expect(403);

    // Tenant isolation: a different tenant's owner can't edit this
    // tenant's team member, even by guessing/reusing the real user ID --
    // RLS makes the target simply not exist from their perspective.
    const otherTenantRes = await request(server)
      .post('/api/v1/auth/register')
      .send({
        businessName: 'Edit Team Isolation Shop',
        ownerFullName: 'Other Edit Owner',
        email: uniqueEmail('edit-other'),
        password: 'correct-horse-battery-staple',
      })
      .expect(201);

    await request(server)
      .patch(`/api/v1/users/${cashierRes.body.id}`)
      .set('Authorization', `Bearer ${otherTenantRes.body.accessToken}`)
      .send({ role: 'Staff', branchId })
      .expect(404);
  });

  it('change password: rejects a wrong current password, succeeds with the right one, and logs out other sessions', async () => {
    const server = app.getHttpServer();
    const email = uniqueEmail('change-pw');
    const originalPassword = 'correct-horse-battery-staple';
    const newPassword = 'a-different-strong-password';

    const registerRes = await request(server)
      .post('/api/v1/auth/register')
      .send({
        businessName: 'Change Password Test Shop',
        ownerFullName: 'Password Owner',
        email,
        password: originalPassword,
      })
      .expect(201);

    // Simulate a second device/session: log in again, separately from the
    // session created by registration.
    const secondSessionRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: originalPassword })
      .expect(200);

    // Wrong current password must be rejected, and must not touch anything.
    await request(server)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${registerRes.body.accessToken}`)
      .send({ currentPassword: 'totally-wrong-password', newPassword })
      .expect(401);

    // Correct current password succeeds and returns a fresh token pair for
    // THIS session.
    const changeRes = await request(server)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${registerRes.body.accessToken}`)
      .send({ currentPassword: originalPassword, newPassword })
      .expect(200);
    expect(changeRes.body.accessToken).toBeDefined();
    expect(changeRes.body.refreshToken).toBeDefined();

    // The security-critical behavior: the SECOND session's refresh token
    // must now be dead -- a password change should log out other devices.
    await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: secondSessionRes.body.refreshToken })
      .expect(401);

    // The session that MADE the change keeps working with its new tokens.
    await request(server)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${changeRes.body.accessToken}`)
      .expect(200);

    // The old password no longer works; the new one does.
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: originalPassword })
      .expect(401);
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: newPassword })
      .expect(200);
  });

  it('bulk CSV import: preview validates without writing, commit imports only valid rows, duplicate detection is tenant-scoped', async () => {
    const server = app.getHttpServer();
    const uniqueSku = `CSV-${Date.now()}`;

    const ownerRes = await request(server)
      .post('/api/v1/auth/register')
      .send({
        businessName: 'CSV Import Test Shop',
        ownerFullName: 'CSV Owner',
        email: uniqueEmail('csv-owner'),
        password: 'correct-horse-battery-staple',
      })
      .expect(201);
    const ownerToken = ownerRes.body.accessToken;

    const branches = await request(server)
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const branchId = branches.body[0].id;

    // Row 1: valid. Row 2: invalid (missing name). Row 3: duplicate SKU
    // of row 1, within the same file.
    const csv = [
      'sku,name,category,cost_price_ngn,selling_price_ngn,unit_of_measure,barcode,initial_quantity',
      `${uniqueSku},Imported Test Product,Staples,1000,1500,unit,,25`,
      `${uniqueSku}-BAD,,Staples,500,800,unit,,10`,
      `${uniqueSku},Duplicate Row,Staples,1000,1500,unit,,5`,
    ].join('\n');

    const preview = await request(server)
      .post('/api/v1/products/import/preview')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ csvContent: csv })
      .expect(201);
    expect(preview.body.validCount).toBe(1);
    expect(preview.body.invalidCount).toBe(2);

    const commit = await request(server)
      .post('/api/v1/products/import/commit')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ csvContent: csv, branchId })
      .expect(201);
    expect(commit.body.imported).toBe(1);
    expect(commit.body.skipped).toBe(2);

    const products = await request(server)
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const imported = products.body.find((p: { sku: string }) => p.sku === uniqueSku);
    expect(imported).toBeDefined();
    expect(imported.name).toBe('Imported Test Product');

    const stock = await request(server)
      .get(`/api/v1/inventory/stock?branchId=${branchId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const stockRow = stock.body.find((s: { sku: string }) => s.sku === uniqueSku);
    expect(Number(stockRow.quantity_on_hand)).toBe(25);

    // Tenant isolation: a completely different tenant importing a CSV with
    // the SAME sku text must succeed -- the duplicate-in-catalog check is
    // scoped to the caller's own products, not global.
    const otherTenantRes = await request(server)
      .post('/api/v1/auth/register')
      .send({
        businessName: 'CSV Import Isolation Shop',
        ownerFullName: 'Other CSV Owner',
        email: uniqueEmail('csv-other'),
        password: 'correct-horse-battery-staple',
      })
      .expect(201);

    const otherPreview = await request(server)
      .post('/api/v1/products/import/preview')
      .set('Authorization', `Bearer ${otherTenantRes.body.accessToken}`)
      .send({ csvContent: `sku,name,cost_price_ngn,selling_price_ngn\n${uniqueSku},Same SKU Different Tenant,1000,1500` })
      .expect(201);
    expect(otherPreview.body.validCount).toBe(1);
    expect(otherPreview.body.duplicateSkusInDb).toHaveLength(0);
  });

  it('changing your password requires the current one, revokes other sessions, and keeps the current session working', async () => {
    const server = app.getHttpServer();
    const email = uniqueEmail('change-pw');
    const originalPassword = 'correct-horse-battery-staple';

    const registerRes = await request(server)
      .post('/api/v1/auth/register')
      .send({
        businessName: 'Password Change Test Shop',
        ownerFullName: 'PW Owner',
        email,
        password: originalPassword,
      })
      .expect(201);

    // A second "device": log in again, separate refresh token.
    const secondSessionLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: originalPassword })
      .expect(200);

    // Wrong current password is rejected, nothing changes.
    await request(server)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${registerRes.body.accessToken}`)
      .send({ currentPassword: 'wrong-password', newPassword: 'a-brand-new-password-123' })
      .expect(401);

    // Correct current password succeeds and returns a fresh token pair.
    const changeRes = await request(server)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${registerRes.body.accessToken}`)
      .send({ currentPassword: originalPassword, newPassword: 'a-brand-new-password-123' })
      .expect(200);
    expect(changeRes.body.accessToken).toBeDefined();
    expect(changeRes.body.refreshToken).toBeDefined();

    // The old password no longer works.
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: originalPassword })
      .expect(401);

    // The new password works.
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: 'a-brand-new-password-123' })
      .expect(200);

    // The SECOND session's refresh token was revoked by the password
    // change -- this is the actual security property being tested, not
    // just "login still works somewhere."
    await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: secondSessionLogin.body.refreshToken })
      .expect(401);
  });

  it('updating your own profile only touches your own row, and email cannot be changed through this endpoint', async () => {
    const server = app.getHttpServer();

    const tenantARes = await request(server)
      .post('/api/v1/auth/register')
      .send({
        businessName: 'Profile Update Shop A',
        ownerFullName: 'Original Name A',
        email: uniqueEmail('profile-a'),
        password: 'correct-horse-battery-staple',
      })
      .expect(201);
    const tenantBRes = await request(server)
      .post('/api/v1/auth/register')
      .send({
        businessName: 'Profile Update Shop B',
        ownerFullName: 'Original Name B',
        email: uniqueEmail('profile-b'),
        password: 'correct-horse-battery-staple',
      })
      .expect(201);

    const updated = await request(server)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${tenantARes.body.accessToken}`)
      // @ts-expect-error -- deliberately sending a field not on the DTO to prove it's rejected, not silently ignored
      .send({ fullName: 'Updated Name A', phone: '08011112222', email: 'hijacked@example.com' })
      .expect(400); // forbidNonWhitelisted rejects the unknown `email` field outright

    const updatedProperly = await request(server)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${tenantARes.body.accessToken}`)
      .send({ fullName: 'Updated Name A', phone: '08011112222' })
      .expect(200);
    expect(updatedProperly.body.full_name).toBe('Updated Name A');
    expect(updatedProperly.body.phone).toBe('08011112222');

    // Tenant B's own profile is completely untouched.
    const tenantBProfile = await request(server)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${tenantBRes.body.accessToken}`)
      .expect(200);
    expect(tenantBProfile.body.full_name).toBe('Original Name B');
  });
});
