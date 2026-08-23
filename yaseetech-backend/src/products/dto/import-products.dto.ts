import { IsString, IsUUID, MinLength } from 'class-validator';

export class ImportPreviewDto {
  @IsString()
  @MinLength(1)
  csvContent!: string;
}

export class ImportCommitDto {
  @IsString()
  @MinLength(1)
  csvContent!: string;

  // Initial stock quantities from the CSV all land in one branch per
  // import -- matches the real use case (onboarding one location's
  // existing inventory at a time), and keeps the CSV format itself simple
  // (no branch column needed per row).
  @IsUUID()
  branchId!: string;
}
