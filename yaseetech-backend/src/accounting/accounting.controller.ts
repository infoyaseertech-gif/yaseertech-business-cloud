import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/guards/request-user.interface';
import { AppException } from '../common/exceptions/app.exception';
import { AccountingService } from './accounting.service';

function requireDateRange(startDate?: string, endDate?: string): void {
  if (!startDate || !endDate) {
    throw new AppException(
      'MISSING_DATE_RANGE',
      'Both startDate and endDate query parameters are required (format: YYYY-MM-DD).',
      HttpStatus.BAD_REQUEST,
    );
  }
}

// Every endpoint here is read-only reporting, gated by accounting.view --
// Accountant and Business Owner have it per the Phase 1 RBAC matrix.
// There's no accounting.manage-only endpoint in this module because
// nothing here writes; the actual journal entries are posted by POS and
// Invoicing at the moment a sale/invoice/payment happens, not edited here.
@Controller('accounting')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('accounting.view')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Get('profit-and-loss')
  profitAndLoss(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    requireDateRange(startDate, endDate);
    return this.accountingService.profitAndLoss(user, startDate, endDate);
  }

  @Get('balance-sheet')
  balanceSheet(@CurrentUser() user: RequestUser, @Query('asOfDate') asOfDate?: string) {
    return this.accountingService.balanceSheet(user, asOfDate ?? new Date().toISOString().slice(0, 10));
  }

  @Get('cash-flow')
  cashFlow(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    requireDateRange(startDate, endDate);
    return this.accountingService.cashFlow(user, startDate, endDate);
  }

  @Get('journal')
  journal(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
  ) {
    return this.accountingService.journal(user, startDate, endDate, limit ? parseInt(limit, 10) : 50);
  }

  @Get('chart-of-accounts')
  chartOfAccounts(@CurrentUser() user: RequestUser) {
    return this.accountingService.chartOfAccounts(user);
  }
}
