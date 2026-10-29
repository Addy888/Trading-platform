import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { SimulationPaymentProvider } from './providers/simulation.provider';
import { StripePaymentProvider } from './providers/stripe.provider';
import { PaymentProviderFactory } from './providers/payment-provider.factory';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    SimulationPaymentProvider,
    StripePaymentProvider,
    PaymentProviderFactory,
  ],
  exports: [PaymentsService, PaymentProviderFactory],
})
export class PaymentsModule {}
