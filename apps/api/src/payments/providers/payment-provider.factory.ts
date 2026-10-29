import { Injectable, Logger } from '@nestjs/common';
import { PaymentProvider } from './payment-provider.interface';
import { SimulationPaymentProvider } from './simulation.provider';
import { StripePaymentProvider } from './stripe.provider';

@Injectable()
export class PaymentProviderFactory {
  private readonly logger = new Logger(PaymentProviderFactory.name);
  private readonly providers = new Map<string, PaymentProvider>();

  constructor(
    private readonly simulationProvider: SimulationPaymentProvider,
    private readonly stripeProvider: StripePaymentProvider,
  ) {
    this.registerProvider(this.simulationProvider);
    this.registerProvider(this.stripeProvider);
  }

  registerProvider(provider: PaymentProvider) {
    this.providers.set(provider.name.toUpperCase(), provider);
  }

  getProvider(providerName?: string): PaymentProvider {
    if (providerName) {
      const match = this.providers.get(providerName.toUpperCase());
      if (match) return match;
    }

    const envProvider = process.env.PAYMENT_PROVIDER?.toUpperCase();
    if (envProvider && this.providers.has(envProvider)) {
      const selected = this.providers.get(envProvider)!;
      return selected;
    }

    // If Stripe is configured, default to Stripe
    if (this.stripeProvider.isConfigured()) {
      return this.stripeProvider;
    }

    // Default to Simulation provider
    return this.simulationProvider;
  }

  getAllProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  isStripeConfigured(): boolean {
    return this.stripeProvider.isConfigured();
  }
}
