import {
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  businessName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  ownerFullName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  // Deliberately just a length floor here, not a complexity regex --
  // complexity rules push users toward predictable substitutions ("P@ssw0rd")
  // without meaningfully raising real entropy. A minimum length plus bcrypt
  // at a sensible cost factor covers this better for a v1 SME audience.
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
