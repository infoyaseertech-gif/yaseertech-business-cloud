import { IsIn } from 'class-validator';

// Enterprise is deliberately excluded -- its price_ngn is NULL (custom
// pricing per 002_platform_tables.sql), so there is no amount to hand
// Flutterwave. Enterprise sign-up is a sales conversation, not a checkout
// button; BillingService rejects it explicitly rather than silently
// producing a ₦0 or ₦NaN charge.
export class InitiateCheckoutDto {
  @IsIn(['starter', 'growth', 'pro'])
  planCode!: 'starter' | 'growth' | 'pro';
}
