import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PaymentStatusExtended } from '@prisma/client';
import {
  PaymentProvider,
  CreateCheckoutSessionInput,
  CheckoutSessionOutput,
  WebhookVerificationResult,
  ProviderPaymentDetails,
} from './payment-provider.interface';

@Injectable()
export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'STRIPE';
  private readonly logger = new Logger(StripePaymentProvider.name);
  private readonly apiKey: string;
  private readonly webhookSecret: string;

  constructor() {
    this.apiKey = process.env.STRIPE_SECRET_KEY || '';
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.webhookSecret);
  }

  async createCheckoutSession(
    input: CreateCheckoutSessionInput,
  ): Promise<CheckoutSessionOutput> {
    if (!this.isConfigured()) {
      throw new BadRequestException(
        'Stripe payment gateway is not configured. Please add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to your environment configuration, or use the test simulation provider instead.',
      );
    }

    // Validate amount
    const amountNum = parseFloat(input.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new BadRequestException('Invalid deposit amount');
    }

    // Amount in cents for Stripe
    const amountInCents = Math.round(amountNum * 100);

    const bodyParams = new URLSearchParams({
      'payment_method_types[0]': 'card',
      'line_items[0][price_data][currency]': input.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': amountInCents.toString(),
      'line_items[0][price_data][product_data][name]': input.description || 'Wallet Deposit',
      'line_items[0][quantity]': '1',
      mode: 'payment',
      success_url: input.successUrl || `${process.env.APP_URL || 'http://localhost:3000'}/dashboard/wallet?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: input.cancelUrl || `${process.env.APP_URL || 'http://localhost:3000'}/dashboard/wallet?status=cancelled`,
      client_reference_id: input.internalReference,
      customer_email: input.userEmail,
      'metadata[paymentId]': input.paymentId,
      'metadata[userId]': input.userId,
      'metadata[internalReference]': input.internalReference,
    });

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyParams.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Stripe checkout creation failed: ${errorText}`);
      throw new BadRequestException(`Failed to create Stripe checkout session: ${response.statusText}`);
    }

    const session: any = await response.json();
    return {
      providerReference: session.id,
      checkoutUrl: session.url,
      providerData: {
        paymentIntentId: session.payment_intent,
      },
    };
  }

  async verifyWebhook(
    payload: Buffer | string,
    signature: string,
    headers?: Record<string, string | string[] | undefined>,
  ): Promise<WebhookVerificationResult> {
    if (!this.isConfigured()) {
      throw new BadRequestException('Stripe webhook secret is not configured.');
    }

    if (!signature) {
      throw new UnauthorizedException('Missing stripe-signature header');
    }

    const payloadString =
      typeof payload === 'string' ? payload : payload.toString('utf8');

    // Parse stripe-signature: t=timestamp,v1=signature
    const parts = signature.split(',');
    let timestamp = '';
    let signatures: string[] = [];

    for (const part of parts) {
      const [key, val] = part.trim().split('=');
      if (key === 't') timestamp = val;
      if (key === 'v1') signatures.push(val);
    }

    if (!timestamp || signatures.length === 0) {
      throw new BadRequestException('Invalid stripe-signature format');
    }

    // Check tolerance (5 minutes)
    const currentTimeSec = Math.floor(Date.now() / 1000);
    const eventTimeSec = parseInt(timestamp, 10);
    if (isNaN(eventTimeSec) || Math.abs(currentTimeSec - eventTimeSec) > 300) {
      throw new UnauthorizedException('Stripe webhook timestamp outside tolerance threshold (replay attack prevented)');
    }

    // Compute expected signature
    const signedPayload = `${timestamp}.${payloadString}`;
    const expectedSig = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(signedPayload)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSig, 'utf8');
    const matched = signatures.some((sig) => {
      const sigBuffer = Buffer.from(sig, 'utf8');
      return (
        sigBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(sigBuffer, expectedBuffer)
      );
    });

    if (!matched) {
      throw new UnauthorizedException('Invalid Stripe webhook signature');
    }

    let event: any;
    try {
      event = JSON.parse(payloadString);
    } catch {
      throw new BadRequestException('Invalid JSON webhook payload');
    }

    const eventType = event.type;
    const sessionOrIntent = event.data?.object || {};
    const providerReference = sessionOrIntent.id;
    const internalReference =
      sessionOrIntent.client_reference_id ||
      sessionOrIntent.metadata?.internalReference;

    let amount: string | undefined;
    if (sessionOrIntent.amount_total !== undefined) {
      amount = (sessionOrIntent.amount_total / 100).toFixed(2);
    } else if (sessionOrIntent.amount !== undefined) {
      amount = (sessionOrIntent.amount / 100).toFixed(2);
    }

    const currency = sessionOrIntent.currency?.toUpperCase();

    let status: PaymentStatusExtended = PaymentStatusExtended.PROCESSING;
    if (
      eventType === 'checkout.session.completed' ||
      eventType === 'payment_intent.succeeded' ||
      eventType === 'charge.succeeded'
    ) {
      status = PaymentStatusExtended.SUCCESS;
    } else if (
      eventType === 'payment_intent.payment_failed' ||
      eventType === 'charge.failed'
    ) {
      status = PaymentStatusExtended.FAILED;
    } else if (eventType === 'checkout.session.expired') {
      status = PaymentStatusExtended.CANCELLED;
    } else if (eventType === 'charge.refunded') {
      status = PaymentStatusExtended.REFUNDED;
    }

    return {
      isValid: true,
      provider: this.name,
      eventType,
      providerReference,
      internalReference,
      amount,
      currency,
      status,
      metadata: sessionOrIntent.metadata,
      rawEvent: event,
    };
  }

  async getPaymentDetails(
    providerReference: string,
  ): Promise<ProviderPaymentDetails> {
    if (!this.isConfigured()) {
      throw new BadRequestException('Stripe API key is not configured.');
    }

    const response = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${providerReference}`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      },
    );

    if (!response.ok) {
      throw new BadRequestException(`Failed to retrieve Stripe session: ${response.statusText}`);
    }

    const session: any = await response.json();
    const amount = session.amount_total ? (session.amount_total / 100).toFixed(2) : '0.00';
    const currency = (session.currency || 'USD').toUpperCase();

    let status: PaymentStatusExtended = PaymentStatusExtended.PENDING;
    if (session.payment_status === 'paid') {
      status = PaymentStatusExtended.SUCCESS;
    } else if (session.status === 'expired') {
      status = PaymentStatusExtended.CANCELLED;
    }

    return {
      providerReference: session.id,
      amount,
      currency,
      status,
      metadata: session.metadata,
    };
  }
}
