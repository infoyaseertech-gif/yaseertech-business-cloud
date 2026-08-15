import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/guards/request-user.interface';
import { BranchesService } from './branches.service';

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
}
