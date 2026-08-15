import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MaxLength(64)
  sku!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsNumber()
  @Min(0)
  costPriceNgn!: number;

  @IsNumber()
  @Min(0)
  sellingPriceNgn!: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unitOfMeasure?: string;
}
