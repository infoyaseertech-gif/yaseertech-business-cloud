import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/guards/request-user.interface';
import { UsersService } from './users.service';
import { CreateTeamMemberDto } from './dto/create-team-member.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // The concrete proof that tenancy works: this query runs inside
  // withTenantContext, scoped by RLS to request.user.tenantId (taken only
  // from the verified JWT). Log in as a user from Tenant A and this can
  // never return a row belonging to Tenant B, even if you tampered with
  // the URL or body -- there's no tenant_id parameter to tamper with.
  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return this.usersService.getProfile(user);
  }

  // Edits the caller's own name/phone -- no permission needed beyond
  // being authenticated, since you're only ever touching your own row.
  // Declared BEFORE the PATCH(':id') route below: Nest/Express match
  // routes in declaration order, and ':id' would otherwise treat the
  // literal path "me" as if it were a target user's id.
  @Patch('me')
  updateOwnProfile(@CurrentUser() user: RequestUser, @Body() dto: UpdateOwnProfileDto) {
    return this.usersService.updateOwnProfile(user, dto);
  }

  // The concrete proof that RBAC works: PermissionsGuard runs after
  // JwtAuthGuard, checks this caller's role_permissions for
  // 'users.manage', and rejects with 403 FORBIDDEN_MISSING_PERMISSION if
  // it's absent -- e.g. a Cashier hitting this endpoint. Per the seed data
  // in migration 014, only Business Owner has this permission.
  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('users.manage')
  list(@CurrentUser() user: RequestUser) {
    return this.usersService.listTenantUsers(user);
  }

  // Adds a teammate to the caller's own tenant with an assigned role and
  // (for branch-scoped roles) a branch. Also requires users.manage --
  // same permission that gates viewing the team list.
  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('users.manage')
  createTeamMember(@CurrentUser() user: RequestUser, @Body() dto: CreateTeamMemberDto) {
    return this.usersService.createTeamMember(user, dto);
  }

  // Reassigns an existing teammate's role and/or branch. Cannot target
  // whoever currently holds the Business Owner role -- see
  // UsersService.updateTeamMember for why.
  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('users.manage')
  updateTeamMember(
    @CurrentUser() user: RequestUser,
    @Param('id') targetUserId: string,
    @Body() dto: UpdateTeamMemberDto,
  ) {
    return this.usersService.updateTeamMember(user, targetUserId, dto);
  }
}

