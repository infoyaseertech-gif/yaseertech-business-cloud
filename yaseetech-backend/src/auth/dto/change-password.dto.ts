import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  // Same reasoning as RegisterDto: a length floor, not a complexity regex.
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
