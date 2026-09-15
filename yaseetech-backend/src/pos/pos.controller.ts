import {
  Body, Controller, Get, Param, Post, Query, StreamableFile, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/guards/request-user.interface';
import { PosService } from './pos.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { buildReceiptPdf } from '../common/pdf/receipt-pdf.builder';

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
  listSales(@CurrentUser() user: RequestUser, @Query('branchId') branchId?: string, @Query('limit') limit?: string) {
    return this.posService.listSales(user, branchId, limit ? parseInt(limit, 10) : 20);
  }

  @Get('sales/:id/receipt.pdf')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('pos.create_sale')
  async getReceiptPdf(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<StreamableFile> {
    const sale = await this.posService.getSaleForReceipt(user, id);
    const bytes = await buildReceiptPdf({
      businessName: sale.business_name,
      branchName: sale.branch_name,
      transactionNumber: sale.transaction_number,
      occurredAt: sale.occurred_at,
      cashierName: sale.cashier_name,
      items: sale.items.map((i: any) => ({
        name: i.name, quantity: Number(i.quantity),
        unitPriceNgn: Number(i.unit_price_ngn), lineTotalNgn: Number(i.line_total_ngn),
      })),
      subtotalNgn: Number(sale.subtotal_ngn),
      taxNgn: Number(sale.tax_ngn),
      totalNgn: Number(sale.total_ngn),
      payments: sale.payments.map((p: any) => ({ method: p.method, amountNgn: Number(p.amount_ngn) })),
    });
    return new StreamableFile(bytes, {
      type: 'application/pdf',
      disposition: `attachment; filename="receipt-${sale.transaction_number}.pdf"`,
    });
  }
}
