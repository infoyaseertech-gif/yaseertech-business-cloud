import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/guards/request-user.interface';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // inventory.view: both Cashier and Branch Manager have this per the
  // Phase 1 RBAC matrix -- a cashier needs to see what's sellable.
  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('inventory.view')
  list(@CurrentUser() user: RequestUser) {
    return this.productsService.list(user);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('inventory.view')
  getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.productsService.getOne(user, id);
  }

  // inventory.manage: only Business Owner and Branch Manager -- a Cashier
  // can sell a product but not create/edit the catalog.
  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('inventory.manage')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateProductDto) {
    return this.productsService.create(user, dto);
  }
}
