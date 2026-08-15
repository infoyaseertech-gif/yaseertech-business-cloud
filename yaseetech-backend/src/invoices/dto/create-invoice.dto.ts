import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class InvoiceItemDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsString()
  @MaxLength(300)
  description!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPriceNgn!: number;
}

export class CreateInvoiceDto {
  @IsUUID()
  branchId!: string;

  @IsUUID()
  customerId!: string;

  @IsISO8601()
  dueDate!: string;

  @IsOptional()
  @IsISO8601()
  issueDate?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items!: InvoiceItemDto[];
}
