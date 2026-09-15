import { IsOptional, IsString, MaxLength } from 'class-validator';

// Deliberately does NOT include email. Changing your login email has
// bigger implications than a name/phone edit -- it's the identifier
// find_user_for_login() searches on (migration 015), and the v1
// simplification that treats email as unique platform-wide (not just
// per-tenant) means an email change needs its own careful validation
// path, not a quiet field on a general profile form. Out of scope here,
// on purpose.
export class UpdateOwnProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;
}
