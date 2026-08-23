import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/guards/request-user.interface';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ImportCommitDto, ImportPreviewDto } from './dto/import-products.dto';

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

  // Validates a CSV and reports what would happen -- writes nothing.
  // The frontend calls this first, shows the person exactly which rows
  // are valid/invalid, and only calls /import/commit if they confirm.
  @Post('import/preview')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('inventory.manage')
  importPreview(@CurrentUser() user: RequestUser, @Body() dto: ImportPreviewDto) {
    return this.productsService.importPreview(user, dto);
  }

  @Post('import/commit')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('inventory.manage')
  importCommit(@CurrentUser() user: RequestUser, @Body() dto: ImportCommitDto) {
    return this.productsService.importCommit(user, dto);
  }
}
