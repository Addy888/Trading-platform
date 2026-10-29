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
export class SimulationPaymentProvider implements PaymentProvider {
  readonly name = 'SIMULATION';
  private readonly logger = new Logger(SimulationPaymentProvider.name);
  private readonly webhookSecret: string;
  private readonly simulationRecords = new Map<string, ProviderPaymentDetails>();

  constructor() {
    this.webhookSecret =
      process.env.PAYMENT_WEBHOOK_SECRET ||
      'dev-simulated-webhook-secret-tradeing-platform-2026';
  }

  async createCheckoutSession(
    input: CreateCheckoutSessionInput,
  ): Promise<CheckoutSessionOutput> {
    const providerReference = `SIM-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const checkoutUrl = `/dashboard/wallet/checkout?ref=${encodeURIComponent(
      input.internalReference,
    )}&providerRef=${encodeURIComponent(providerReference)}&amount=${encodeURIComponent(
      input.amount,
    )}&currency=${encodeURIComponent(input.currency)}`;

    this.simulationRecords.set(providerReference, {
      providerReference,
      amount: input.amount,
      currency: input.currency,
      status: PaymentStatusExtended.PENDING,
      metadata: input.metadata,
    });

    return {
      providerReference,
      checkoutUrl,
      providerData: {
        mode: 'SIMULATION',
        internalReference: input.internalReference,
        amount: input.amount,
        currency: input.currency,
      },
    };
  }

  async verifyWebhook(
    payload: Buffer | string,
    signature: string,
    headers?: Record<string, string | string[] | undefined>,
  ): Promise<WebhookVerificationResult> {
    if (!signature) {
      throw new UnauthorizedException('Missing webhook signature header');
    }

    const payloadString =
      typeof payload === 'string' ? payload : payload.toString('utf8');

    // Expected format: t=1697000000,v1=abcdef...
    const parts = signature.split(',');
    let timestamp = '';
    let receivedSig = '';

    for (const part of parts) {
      const [key, val] = part.trim().split('=');
      if (key === 't') timestamp = val;
      if (key === 'v1') receivedSig = val;
    }

    if (!timestamp || !receivedSig) {
      throw new BadRequestException('Malformed signature header');
    }

    // Check for replay attacks (5 minutes tolerance)
    const currentTimeSec = Math.floor(Date.now() / 1000);
    const eventTimeSec = parseInt(timestamp, 10);
    if (isNaN(eventTimeSec) || Math.abs(currentTimeSec - eventTimeSec) > 300) {
      throw new UnauthorizedException('Webhook timestamp outside allowed tolerance (replay attack prevented)');
    }

    // Compute expected HMAC
    const signedPayload = `${timestamp}.${payloadString}`;
    const expectedSig = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(signedPayload)
      .digest('hex');

    // Constant-time comparison
    const expectedBuffer = Buffer.from(expectedSig, 'utf8');
    const receivedBuffer = Buffer.from(receivedSig, 'utf8');

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    let parsedEvent: any;
    try {
      parsedEvent = JSON.parse(payloadString);
    } catch {
      throw new BadRequestException('Invalid JSON payload');
    }

    const {
      event: eventType,
      providerReference,
      internalReference,
      amount,
      currency,
      metadata,
    } = parsedEvent;

    if (!providerReference || !eventType) {
      throw new BadRequestException('Webhook payload missing required fields');
    }

    let status: PaymentStatusExtended = PaymentStatusExtended.PENDING;
    switch (eventType) {
      case 'payment.succeeded':
      case 'payment.completed':
        status = PaymentStatusExtended.SUCCESS;
        break;
      case 'payment.failed':
        status = PaymentStatusExtended.FAILED;
        break;
      case 'payment.cancelled':
        status = PaymentStatusExtended.CANCELLED;
        break;
      case 'payment.refunded':
        status = PaymentStatusExtended.REFUNDED;
        break;
      default:
        status = PaymentStatusExtended.PROCESSING;
        break;
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
      metadata,
      rawEvent: parsedEvent,
    };
  }

  async getPaymentDetails(
    providerReference: string,
  ): Promise<ProviderPaymentDetails> {
    const record = this.simulationRecords.get(providerReference);
    if (!record) {
      return {
        providerReference,
        amount: '0.00',
        currency: 'USD',
        status: PaymentStatusExtended.PENDING,
      };
    }
    return record;
  }

  /**
   * Helper utility for testing or internal simulation:
   * Generates a signed webhook payload
   */
  generateSignedPayload(
    eventData: {
      event: string;
      providerReference: string;
      internalReference?: string;
      amount?: string;
      currency?: string;
      metadata?: any;
    },
    customSecret?: string,
    customTimestamp?: number,
  ): { payload: string; signature: string; timestamp: number } {
    const timestamp = customTimestamp ?? Math.floor(Date.now() / 1000);
    const payload = JSON.stringify(eventData);
    const secret = customSecret || this.webhookSecret;
    const signedPayload = `${timestamp}.${payload}`;
    const hash = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
    const signature = `t=${timestamp},v1=${hash}`;

    return { payload, signature, timestamp };
  }
}
