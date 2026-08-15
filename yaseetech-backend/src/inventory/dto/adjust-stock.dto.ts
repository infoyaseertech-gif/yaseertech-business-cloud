import { IsIn, IsNumber, IsString, IsUUID, NotEquals } from 'class-validator';

export class AdjustStockDto {
  @IsUUID()
  branchId!: string;

  @IsUUID()
  productId!: string;

  // Positive to add stock (e.g. found extra units in a recount), negative
  // to remove it (e.g. damage, spoilage, theft write-off). Zero is
  // meaningless -- rejected explicitly rather than silently accepted.
  @IsNumber()
  @NotEquals(0)
  quantityDelta!: number;

  @IsString()
  @IsIn(['recount', 'damage', 'spoilage', 'theft', 'other'])
  reasonCode!: string;
}
