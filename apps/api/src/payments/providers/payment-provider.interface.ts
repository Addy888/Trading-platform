import { PaymentStatusExtended } from '@prisma/client';

export interface CreateCheckoutSessionInput {
  paymentId: string;
  internalReference: string;
  userId: string;
  userEmail: string;
  amount: string; // Decimal string e.g. "100.00"
  currency: string; // "USD", etc.
  description?: string;
  successUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, any>;
}

export interface CheckoutSessionOutput {
  providerReference: string;
  checkoutUrl: string;
  providerData?: Record<string, any>;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  provider: string;
  eventType: string;
  providerReference: string;
  internalReference?: string;
  amount?: string;
  currency?: string;
  status: PaymentStatusExtended;
  metadata?: Record<string, any>;
  rawEvent?: any;
}

export interface ProviderPaymentDetails {
  providerReference: string;
  amount: string;
  currency: string;
  status: PaymentStatusExtended;
  metadata?: Record<string, any>;
}

export interface PaymentProvider {
  readonly name: string;

  createCheckoutSession(
    input: CreateCheckoutSessionInput,
  ): Promise<CheckoutSessionOutput>;

  verifyWebhook(
    payload: Buffer | string,
    signature: string,
    headers?: Record<string, string | string[] | undefined>,
  ): Promise<WebhookVerificationResult>;

  getPaymentDetails(
    providerReference: string,
  ): Promise<ProviderPaymentDetails>;
}
