import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/guards/request-user.interface';
import { InventoryService } from './inventory.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';

@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('stock')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('inventory.view')
  getStock(@CurrentUser() user: RequestUser, @Query('branchId') branchId?: string) {
    return this.inventoryService.getStock(user, branchId);
  }

  @Post('adjustments')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('inventory.manage')
  adjust(@CurrentUser() user: RequestUser, @Body() dto: AdjustStockDto) {
    return this.inventoryService.adjustStock(user, dto);
  }
}
