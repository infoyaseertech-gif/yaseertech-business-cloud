import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/guards/request-user.interface';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';

// Deliberately no @RequirePermissions here: knowing which branches your own
// tenant has is basic information every authenticated role needs (a
// Cashier has to pick a branch to sell from) -- gating it behind a
// permission would just force every role to be granted it anyway.
@Controller('branches')
@UseGuards(JwtAuthGuard)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.branchesService.listForTenant(user);
  }

  // branches.manage_all, not branches.manage_own -- creating a NEW branch
  // is an owner-level expansion decision. branches.manage_own (granted to
  // Branch Manager per the Phase 1 RBAC matrix) scopes someone to
  // operating their existing assigned branch, not spinning up new ones.
  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('branches.manage_all')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateBranchDto) {
    return this.branchesService.create(user, dto);
  }
}

