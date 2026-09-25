import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PoolClient } from 'pg';
import { DatabaseService } from '../common/database/database.service';
import { AppException } from '../common/exceptions/app.exception';
import { RequestUser } from '../common/guards/request-user.interface';
import { FlutterwaveClient } from './flutterwave.client';
import { InitiateCheckoutDto } from './dto/initiate-checkout.dto';

// How long a tenant stays 'past_due' (payment failed/lapsed, still has
// full access) before the sweep moves them to 'downgraded_readonly'. A
// business number, not a technical one -- 5 days gives a Kaduna SME time
// to notice a failed transfer and retry before losing write access, per
// Phase 0's consumer-protection note (2.4) on graceful downgrade.
const GRACE_PERIOD_DAYS = 5;

// Every plan renews for 30 days. v1 simplification, stated plainly: this
// is a flat 30-day period, not calendar-month billing (so a Jan 31
// subscriber doesn't get a mismatched Feb-only 28-day period). A real
// calendar-month billing cycle is a Phase 6+ accounting-cycle concern, not
// invented here.
const SUBSCRIPTION_PERIOD_DAYS = 30;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly flutterwave: FlutterwaveClient,
    private readonly configService: ConfigService,
  ) {}

  async listPlans() {
    return this.db.queryPlatform(
      `SELECT code, name, price_ngn, max_branches, max_users, features
       FROM subscription_plans
       WHERE is_active = true
       ORDER BY price_ngn NULLS LAST`,
    );
  }

  async getSubscriptionStatus(user: RequestUser) {
    // tenants has no RLS (platform table, per 012_rls_policies.sql), so
    // this is a direct queryPlatform lookup rather than withTenantContext --
    // consistent with the documented exception, not a workaround of it.
    const tenantRows = await this.db.queryPlatform<{
      subscription_status: string;
      trial_ends_at: string | null;
      past_due_since: string | null;
      plan_code: string;
      plan_name: string;
      plan_price_ngn: string | null;
    }>(
      `SELECT t.subscription_status, t.trial_ends_at, t.past_due_since,
              p.code AS plan_code, p.name AS plan_name, p.price_ngn AS plan_price_ngn
       FROM tenants t
       JOIN subscription_plans p ON p.id = t.subscription_plan_id
       WHERE t.id = $1`,
      [user.tenantId],
    );

    if (tenantRows.length === 0) {
      throw new AppException('TENANT_NOT_FOUND', 'Tenant not found.', HttpStatus.NOT_FOUND);
    }

    const recentPayments = await this.db.withTenantContext(
      { tenantId: user.tenantId, userId: user.userId },
      (client) =>
        client.query(
          `SELECT amount_ngn, currency, status, paid_at, created_at
           FROM payments
           WHERE tenant_id = $1
           ORDER BY created_at DESC
           LIMIT 10`,
          [user.tenantId],
        ),
    );

    return {
      ...tenantRows[0],
      recentPayments: recentPayments.rows,
    };
  }

  /**
   * Starts a hosted-checkout payment for the given plan. Creates (or
   * reuses) the tenant's `subscriptions` row for that plan, then a
   * `payments` row in 'pending' status referencing it, THEN calls
   * Flutterwave -- in that order, so a Flutterwave outage leaves a
   * traceable pending payment row behind rather than nothing at all.
   */
  async initiateCheckout(user: RequestUser, dto: InitiateCheckoutDto) {
    const plans = await this.db.queryPlatform<{ id: string; price_ngn: string | null }>(
      `SELECT id, price_ngn FROM subscription_plans WHERE code = $1 AND is_active = true`,
      [dto.planCode],
    );
    const plan = plans[0];
    if (!plan || plan.price_ngn === null) {
      throw new AppException(
        'PLAN_NOT_CHECKOUT_ELIGIBLE',
        'This plan does not have a checkout price. Contact support for Enterprise pricing.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const amountNgn = Number(plan.price_ngn);

    return this.db.withTenantContext(
      { tenantId: user.tenantId, userId: user.userId },
      async (client) => {
        const userResult = await client.query(
          `SELECT email, full_name FROM users WHERE id = $1`,
          [user.userId],
        );
        if (userResult.rows.length === 0) {
          throw new AppException('USER_NOT_FOUND', 'Authenticated user not found.', HttpStatus.NOT_FOUND);
        }
        const { email, full_name: fullName } = userResult.rows[0];

        const subscriptionId = await this.findOrCreateSubscription(client, user.tenantId, plan.id);

        const txRef = `sub-${user.tenantId.slice(0, 8)}-${Date.now().toString(36)}`;

        await client.query(
          `INSERT INTO payments (tenant_id, subscription_id, amount_ngn, currency, flutterwave_tx_ref, status)
           VALUES ($1, $2, $3, 'NGN', $4, 'pending')`,
          [user.tenantId, subscriptionId, amountNgn, txRef],
        );

        const frontendUrl = (this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3001').split(
          ',',
        )[0];

        const { link } = await this.flutterwave.initializeTransaction({
          txRef,
          amountNgn,
          customerEmail: email,
          customerName: fullName,
          redirectUrl: `${frontendUrl}/dashboard/settings?billingTxRef=${txRef}`,
        });

        return { paymentLink: link, txRef };
      },
    );
  }

  private async findOrCreateSubscription(
    client: PoolClient,
    tenantId: string,
    planId: string,
  ): Promise<string> {
    const existing = await client.query(
      `SELECT id FROM subscriptions
       WHERE tenant_id = $1 AND plan_id = $2 AND status IN ('trialing', 'active', 'past_due')
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, planId],
    );
    if (existing.rows.length > 0) {
      return existing.rows[0].id as string;
    }
    const created = await client.query(
      `INSERT INTO subscriptions (tenant_id, plan_id, status)
       VALUES ($1, $2, 'trialing')
       RETURNING id`,
      [tenantId, planId],
    );
    return created.rows[0].id as string;
  }

  /**
   * Called by both the webhook and the manual /billing/verify endpoint
   * (the frontend hits the latter right after Flutterwave redirects the
   * browser back -- see BillingController). Idempotent and safe to call
   * more than once for the same tx_ref: a payment already marked
   * 'successful' short-circuits immediately.
   *
   * Per Phase 0's risk register (risk #1), this NEVER trusts the caller's
   * claim about payment status -- webhook payload or redirect query
   * string alike. It always re-verifies server-to-server against
   * Flutterwave using verifyTransactionByReference, and checks the
   * amount/currency Flutterwave reports against what we stored when the
   * payment was created, before changing anything.
   */
  async reconcilePayment(txRef: string): Promise<{ status: string }> {
    const payment = await this.db.findPaymentForWebhook(txRef);
    if (!payment) {
      throw new AppException('PAYMENT_NOT_FOUND', `No payment found for reference ${txRef}.`, HttpStatus.NOT_FOUND);
    }

    if (payment.status === 'successful') {
      return { status: 'successful' }; // idempotent no-op -- duplicate webhook delivery or repeat verify call
    }

    const verification = await this.flutterwave.verifyTransactionByReference(txRef);
    if (!verification) {
      // Not an error -- Flutterwave genuinely doesn't have this
      // transaction yet (still pending, or the user abandoned checkout).
      return { status: payment.status };
    }

    const amountMatches = Math.abs(verification.amount - Number(payment.amount_ngn)) < 0.01;
    const currencyMatches = verification.currency === payment.currency;

    if (verification.status !== 'successful' || !amountMatches || !currencyMatches) {
      if (verification.status === 'successful' && (!amountMatches || !currencyMatches)) {
        // Flutterwave says paid, but for a different amount/currency than
        // we asked for -- never auto-accept this. Flag it the same way
        // POS flags a negative-stock conflict: apply nothing silently,
        // leave pending, and make it loud for a human to look at.
        this.logger.error(
          `Amount/currency mismatch for tx_ref=${txRef}: expected ${payment.amount_ngn} ${payment.currency}, ` +
            `Flutterwave reports ${verification.amount} ${verification.currency}. NOT marking successful.`,
        );
        await this.db.withTenantContext({ tenantId: payment.tenant_id }, (client) =>
          client.query(
            `UPDATE payments SET status = 'reversed', raw_webhook_payload = raw_webhook_payload || $2::jsonb WHERE id = $1`,
            [payment.id, JSON.stringify({ reconcile_mismatch: verification })],
          ),
        );
        return { status: 'reversed' };
      }
      return { status: payment.status };
    }

    await this.db.withTenantContext({ tenantId: payment.tenant_id }, async (client) => {
      await client.query(
        `UPDATE payments
         SET status = 'successful', paid_at = now(), flutterwave_tx_id = $2
         WHERE id = $1`,
        [payment.id, verification.flutterwaveTxId],
      );

      const periodEnd = new Date(Date.now() + SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000);

      const subResult = await client.query(
        `UPDATE subscriptions
         SET status = 'active', current_period_start = now(), current_period_end = $2, updated_at = now()
         WHERE id = $1
         RETURNING plan_id`,
        [payment.subscription_id, periodEnd.toISOString()],
      );
      const planId = subResult.rows[0]?.plan_id;

      await client.query(
        `UPDATE tenants
         SET subscription_status = 'active', subscription_plan_id = COALESCE($2, subscription_plan_id),
             past_due_since = NULL, updated_at = now()
         WHERE id = $1`,
        [payment.tenant_id, planId],
      );
    });

    return { status: 'successful' };
  }

  /**
   * Handles a Flutterwave webhook call. Signature verification
   * (comparing the verif-hash header) happens in BillingController,
   * before this is ever called -- this method only knows about payload
   * shape, not transport-level auth.
   */
  async handleWebhook(payload: any): Promise<{ status: string }> {
    const txRef = payload?.data?.tx_ref;
    if (!txRef || typeof txRef !== 'string') {
      throw new AppException('INVALID_WEBHOOK_PAYLOAD', 'Webhook payload is missing data.tx_ref.', HttpStatus.BAD_REQUEST);
    }

    // Always record that a webhook arrived, even before we know whether
    // it reconciles cleanly -- raw_webhook_payload exists precisely for
    // this per migration 011's comment ("never parsed and discarded").
    const payment = await this.db.findPaymentForWebhook(txRef);
    if (payment) {
      await this.db.withTenantContext({ tenantId: payment.tenant_id }, (client) =>
        client.query(`UPDATE payments SET raw_webhook_payload = $2::jsonb WHERE id = $1`, [
          payment.id,
          JSON.stringify(payload),
        ]),
      );
    }

    return this.reconcilePayment(txRef);
  }

  /**
   * v1 simplification, stated plainly: there is no in-process job
   * scheduler here (no node-cron running inside this app). This method is
   * the actual sweep logic; DEPLOYMENT.md documents wiring it to Railway's
   * Cron Job feature (or any external scheduler) hitting POST
   * /billing/sweep once a day. Building a scheduler into the API process
   * itself would mean it silently stops running the moment there's more
   * than one instance behind a load balancer (Phase 8 concern) -- an
   * external trigger sidesteps that instead of deferring it.
   */
  async runBillingSweep(): Promise<{
    movedToPastDue: number;
    movedToDowngraded: number;
  }> {
    const pastDueResult = await this.db.queryPlatform(
      `UPDATE tenants
       SET subscription_status = 'past_due', past_due_since = now(), updated_at = now()
       WHERE past_due_since IS NULL
         AND (
           (subscription_status = 'trialing' AND trial_ends_at IS NOT NULL AND trial_ends_at < now())
           OR (
             subscription_status = 'active'
             AND id IN (
               SELECT tenant_id FROM subscriptions
               WHERE status = 'active' AND current_period_end < now()
             )
           )
         )
       RETURNING id`,
    );

    const downgradedResult = await this.db.queryPlatform(
      `UPDATE tenants
       SET subscription_status = 'downgraded_readonly', updated_at = now()
       WHERE subscription_status = 'past_due'
         AND past_due_since IS NOT NULL
         AND past_due_since < now() - interval '${GRACE_PERIOD_DAYS} days'
       RETURNING id`,
    );

    this.logger.log(
      `Billing sweep: ${pastDueResult.length} tenant(s) moved to past_due, ` +
        `${downgradedResult.length} moved to downgraded_readonly.`,
    );

    return {
      movedToPastDue: pastDueResult.length,
      movedToDowngraded: downgradedResult.length,
    };
  }
}
