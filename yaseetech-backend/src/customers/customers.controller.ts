import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/guards/request-user.interface';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  // crm.manage covers both read and write in v1 -- there's no separate
  // crm.view permission code yet (see migration 016's comment on the same
  // gap for Accountant/invoicing). Cashier and Business Owner both have
  // crm.manage per the Phase 1 RBAC matrix, so this isn't a practical
  // restriction for the roles that actually need customer lookup at
  // checkout or invoicing time.
  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('crm.manage')
  list(@CurrentUser() user: RequestUser) {
    return this.customersService.list(user);
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('crm.manage')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(user, dto);
  }
}
