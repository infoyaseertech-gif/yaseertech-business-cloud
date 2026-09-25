import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/guards/request-user.interface';
import { PosService } from './pos.service';
import { CreateSaleDto } from './dto/create-sale.dto';

@Controller('pos')
@UseGuards(JwtAuthGuard)
export class PosController {
  constructor(private readonly posService: PosService) {}

  @Post('sales')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('pos.create_sale')
  createSale(@CurrentUser() user: RequestUser, @Body() dto: CreateSaleDto) {
    return this.posService.createSale(user, dto);
  }

  @Get('sales')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('pos.create_sale')
  listSales(
    @CurrentUser() user: RequestUser,
    @Query('branchId') branchId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.posService.listSales(user, branchId, limit ? parseInt(limit, 10) : 20);
  }
}
