import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/guards/request-user.interface';
import { AppException } from '../common/exceptions/app.exception';
import { BillingService } from './billing.service';
import { InitiateCheckoutDto } from './dto/initiate-checkout.dto';

// No class-level @UseGuards(JwtAuthGuard) here, unlike every other
// controller in this codebase -- deliberately, because two routes below
// (webhook, sweep) are called by machines with no JWT at all, and a
// class-level guard would apply to them whether this comment says so or
// not. JwtAuthGuard is applied per-route instead, below, on exactly the
// routes a logged-in tenant user calls. Also deliberately NOT wrapped
// with SubscriptionStatusGuard anywhere: a tenant whose subscription has
// lapsed must still be able to see plans, see their own status, and pay --
// that's the entire point of 'downgraded_readonly' being a restriction on
// OTHER writes, not this module.
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly configService: ConfigService,
  ) {}

  @Get('plans')
  @UseGuards(JwtAuthGuard)
  listPlans() {
    return this.billingService.listPlans();
  }

  @Get('subscription')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('billing.view')
  getSubscription(@CurrentUser() user: RequestUser) {
    return this.billingService.getSubscriptionStatus(user);
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('billing.manage')
  initiateCheckout(@CurrentUser() user: RequestUser, @Body() dto: InitiateCheckoutDto) {
    return this.billingService.initiateCheckout(user, dto);
  }

  /**
   * Called by the frontend right after Flutterwave redirects the browser
   * back to redirect_url (see BillingService.initiateCheckout). The
   * redirect's own query string is NOT trusted for payment status -- this
   * endpoint re-verifies server-to-server via the same reconcilePayment
   * path the webhook uses, so a user closing the tab before the redirect
   * fires (or a tampered query string) can never fake a successful
   * upgrade. Requires auth (unlike the webhook) because it's called by
   * the logged-in tenant's own browser, not by Flutterwave's servers.
   */
  @Get('verify')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('billing.view')
  verify(@Query('txRef') txRef: string) {
    if (!txRef) {
      throw new AppException('MISSING_TX_REF', 'txRef query parameter is required.', HttpStatus.BAD_REQUEST);
    }
    return this.billingService.reconcilePayment(txRef);
  }

  /**
   * Flutterwave's webhook endpoint. No JwtAuthGuard here on purpose --
   * Flutterwave's servers call this directly, with no user session.
   * Authentication instead comes from comparing the `verif-hash` header
   * to FLUTTERWAVE_WEBHOOK_SECRET_HASH (constant-time, to avoid leaking
   * timing information about how much of the secret matched).
   */
  @Post('webhook')
  handleWebhook(@Headers('verif-hash') verifHash: string, @Body() payload: unknown) {
    const expected = this.configService.get<string>('FLUTTERWAVE_WEBHOOK_SECRET_HASH')!;

    if (!verifHash || !timingSafeEqual(verifHash, expected)) {
      // Deliberately vague: never confirm/deny which part of the check
      // failed to a caller that isn't Flutterwave.
      throw new AppException('INVALID_WEBHOOK_SIGNATURE', 'Invalid signature.', HttpStatus.UNAUTHORIZED);
    }

    return this.billingService.handleWebhook(payload);
  }

  /**
   * Triggered by an external cron (Railway Cron Job or equivalent -- see
   * DEPLOYMENT.md "Billing sweep"), not by a person. Guarded by a static
   * shared secret rather than a JWT, since there is no logged-in user on
   * the other end of a cron trigger.
   */
  @Post('sweep')
  runSweep(@Headers('x-billing-sweep-secret') secret: string) {
    const expected = this.configService.get<string>('BILLING_SWEEP_SECRET')!;
    if (!secret || !timingSafeEqual(secret, expected)) {
      throw new AppException('INVALID_SWEEP_SECRET', 'Invalid or missing sweep secret.', HttpStatus.UNAUTHORIZED);
    }
    return this.billingService.runBillingSweep();
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
