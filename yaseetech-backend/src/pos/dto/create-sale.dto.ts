import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class SaleItemDto {
  @IsUUID()
  productId!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  // Optional: if omitted, the product's current selling_price_ngn is used.
  // Accepting an explicit price too (not just trusting the catalog) is
  // what makes a manual discount/override possible later without a schema
  // change -- v1 doesn't expose that in the UI, but the API already
  // supports it deliberately.
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPriceNgn?: number;
}

export class SalePaymentDto {
  @IsIn(['cash', 'card', 'transfer'])
  method!: 'cash' | 'card' | 'transfer';

  @IsNumber()
  @IsPositive()
  amountNgn!: number;

  @IsOptional()
  reference?: string;
}

export class CreateSaleDto {
  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items!: SaleItemDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalePaymentDto)
  payments!: SalePaymentDto[];

  // Generated on-device by the POS client at the moment of checkout, per
  // Phase 2's schema (sales_transactions.client_transaction_uuid) -- this
  // is the idempotency key that makes offline sync safe to retry. The web
  // dashboard (not offline) still generates one client-side per Phase 1's
  // consistency requirement: every write endpoint that could plausibly be
  // retried needs an idempotency key, not just the mobile POS.
  @IsUUID()
  clientTransactionUuid!: string;

  // When the sale actually happened on-device. Optional because the web
  // dashboard checkout happens in real time (defaults to now()), but an
  // offline POS client syncing later needs to send the real time of sale,
  // not the time it happened to reach the server -- matches
  // sales_transactions.occurred_at in the Phase 2 schema.
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;
}
