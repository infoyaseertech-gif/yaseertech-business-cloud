import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { FlutterwaveClient } from './flutterwave.client';

@Module({
  controllers: [BillingController],
  providers: [BillingService, FlutterwaveClient],
})
export class BillingModule {}
