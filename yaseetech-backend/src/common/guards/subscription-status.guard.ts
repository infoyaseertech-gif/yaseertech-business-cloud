import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from '../database/database.service';
import { AppException } from '../exceptions/app.exception';
import { RequestUser } from './request-user.interface';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Enforces the 'downgraded_readonly' state from Phase 0's risk register
 * (risk #1) and Phase 2's column comment on tenants.subscription_status:
 * "read access retained, write access restricted. Never deleted for
 * non-payment." A tenant that stops paying doesn't lose their data or get
 * locked out of looking at it -- they just can't create new sales,
 * products, invoices, etc. until they pay again.
 *
 * Applied per-controller (class-level @UseGuards, alongside JwtAuthGuard),
 * not globally: it needs request.user, which only exists once JwtAuthGuard
 * has already run, and it has nothing to check on public routes (auth,
 * health) or on billing's own routes (a downgraded tenant must still be
 * able to pay their way out of the downgrade -- BillingController is
 * deliberately never wrapped with this guard).
 *
 * GET requests are always allowed through regardless of status -- only
 * mutating verbs are checked, so a read-only dashboard for a lapsed tenant
 * keeps working without this guard needing a route-by-route allowlist.
 *
 * Cost/tradeoff note, same shape as PermissionsGuard's: one extra query on
 * every mutating request. Acceptable for v1; a per-tenant status cache
 * (invalidated by BillingService on every status change) is the Phase 8
 * fix if this shows up as a real bottleneck under load testing.
 */
@Injectable()
export class SubscriptionStatusGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user: RequestUser }>();

    if (SAFE_METHODS.has(request.method)) {
      return true;
    }

    const rows = await this.db.queryPlatform<{ subscription_status: string }>(
      `SELECT subscription_status FROM tenants WHERE id = $1`,
      [request.user.tenantId],
    );
    const status = rows[0]?.subscription_status;

    if (status === 'downgraded_readonly') {
      throw new AppException(
        'SUBSCRIPTION_DOWNGRADED_READONLY',
        'This account is in read-only mode because a subscription payment is overdue. ' +
          'Renew your plan to resume creating and editing records.',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    return true;
  }
}
