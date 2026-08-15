import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
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
