import { IsIn, IsUUID, ValidateIf } from 'class-validator';
import { AssignableRole } from './create-team-member.dto';

const ASSIGNABLE_ROLES: AssignableRole[] = ['Branch Manager', 'Accountant', 'Cashier', 'Staff'];

export class UpdateTeamMemberDto {
  @IsIn(ASSIGNABLE_ROLES)
  role!: AssignableRole;

  // Same rule as creation: required for branch-scoped roles, omitted for
  // Accountant. Re-validated here rather than trusted from the client,
  // since this DTO is a separate request from creation and the rule needs
  // to hold every time, not just once.
  @ValidateIf((o) => o.role !== 'Accountant')
  @IsUUID()
  branchId?: string;

  // Explicitly not accepted here: fullName, email, password. Editing
  // contact info or resetting a password are different, more sensitive
  // operations than reassigning a role -- deliberately kept out of this
  // endpoint's scope rather than bundled in. Enforced automatically:
  // main.ts's ValidationPipe has forbidNonWhitelisted: true, so sending
  // any field not declared on this class is rejected outright, not
  // silently ignored.
}
