import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const ASSIGNABLE_ROLES = ['Branch Manager', 'Accountant', 'Cashier', 'Staff'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

// Deliberately does NOT allow 'Business Owner' as an assignable role --
// the only path to Owner is registration itself. Adding a second Owner
// via this endpoint would need a much more deliberate design (ownership
// transfer, multiple-owner semantics) than a simple team-invite form.
export class CreateTeamMemberDto {
  @IsString()
  @MaxLength(200)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsIn(ASSIGNABLE_ROLES)
  role!: AssignableRole;

  // Required for branch-scoped roles (Branch Manager, Cashier, Staff);
  // omitted for Accountant, who is all-branches (read) per the Phase 1
  // RBAC matrix. Validated in the service, not just here, since the
  // requirement depends on the value of `role`.
  @ValidateIf((o) => o.role !== 'Accountant')
  @IsUUID()
  branchId?: string;
}
