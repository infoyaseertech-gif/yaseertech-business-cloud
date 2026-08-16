import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './common/database/database.module';
import { GuardsModule } from './common/guards/guards.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { BranchesModule } from './branches/branches.module';
import { ProductsModule } from './products/products.module';
import { InventoryModule } from './inventory/inventory.module';
import { PosModule } from './pos/pos.module';
import { CustomersModule } from './customers/customers.module';
import { InvoicesModule } from './invoices/invoices.module';
import { AccountingModule } from './accounting/accounting.module';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    GuardsModule,
    AuthModule,
    UsersModule,
    HealthModule,
    BranchesModule,
    ProductsModule,
    InventoryModule,
    PosModule,
    CustomersModule,
    InvoicesModule,
    AccountingModule,
  ],
})
export class AppModule {}
