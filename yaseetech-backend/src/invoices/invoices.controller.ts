import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/guards/request-user.interface';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordInvoicePaymentDto } from './dto/record-payment.dto';
import { buildInvoicePdf } from '../common/pdf/invoice-pdf.builder';

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('invoicing.manage')
  list(@CurrentUser() user: RequestUser, @Query('status') status?: string) {
    return this.invoicesService.list(user, status);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('invoicing.manage')
  getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.invoicesService.getOne(user, id);
  }

  @Get(':id/pdf')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('invoicing.manage')
  async getInvoicePdf(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<StreamableFile> {
    const invoice = await this.invoicesService.getInvoiceForPdf(user, id);
    const bytes = await buildInvoicePdf({
      businessName: invoice.business_name,
      businessAddress: invoice.business_address,
      branchName: invoice.branch_name,
      invoiceNumber: invoice.invoice_number,
      status: invoice.status,
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      customerName: invoice.customer_name,
      customerAddress: invoice.customer_address,
      items: invoice.items.map((i: any) => ({
        description: i.description, quantity: Number(i.quantity),
        unitPriceNgn: Number(i.unit_price_ngn), lineTotalNgn: Number(i.line_total_ngn),
      })),
      subtotalNgn: Number(invoice.subtotal_ngn),
      taxNgn: Number(invoice.tax_ngn),
      totalNgn: Number(invoice.total_ngn),
      amountPaidNgn: Number(invoice.amount_paid_ngn),
    });
    return new StreamableFile(bytes, {
      type: 'application/pdf',
      disposition: `attachment; filename="invoice-${invoice.invoice_number}.pdf"`,
    });
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('invoicing.manage')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(user, dto);
  }

  // Separate from creation deliberately: a draft is a document, not yet an
  // accounting event. The revenue/AR journal entry is only posted when the
  // invoice is actually sent -- see InvoicesService.send for why.
  @Post(':id/send')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('invoicing.manage')
  send(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.invoicesService.send(user, id);
  }

  @Post(':id/payments')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('invoicing.manage')
  recordPayment(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: RecordInvoicePaymentDto,
  ) {
    return this.invoicesService.recordPayment(user, id, dto);
  }
}
