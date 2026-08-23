import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/guards/request-user.interface';
import { DashboardService } from './dashboard.service';

// Deliberately no @RequirePermissions here -- every authenticated role
// lands on the dashboard, so the endpoint itself is open. What differs is
// WHICH fields come back: DashboardService checks the caller's actual
// permissions and omits sections they can't see (e.g. a Cashier gets
// today's sales and low-stock alerts, but not outstanding invoice totals,
// since that needs invoicing.manage). Per-field visibility, not an
// all-or-nothing endpoint gate.
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  summary(@CurrentUser() user: RequestUser, @Query('branchId') branchId?: string) {
    return this.dashboardService.getSummary(user, branchId);
  }
}
