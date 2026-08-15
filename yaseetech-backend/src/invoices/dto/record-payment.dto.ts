import { IsIn, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class RecordInvoicePaymentDto {
  @IsNumber()
  @IsPositive()
  amountNgn!: number;

  @IsOptional()
  @IsIn(['cash', 'card', 'transfer'])
  method?: string;

  @IsOptional()
  @IsString()
  reference?: string;
}
