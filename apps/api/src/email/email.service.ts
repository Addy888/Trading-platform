import { Injectable, Logger } from '@nestjs/common';
import { EmailProvider } from './providers/email-provider.interface';
import { DevelopmentEmailProvider } from './providers/development-email.provider';

/**
 * Email Service
 * 
 * Central service for sending emails.
 * 
 * Configuration:
 * - EMAIL_ENABLED: Enable/disable email sending
 * - EMAIL_FROM: Sender email address
 * - EMAIL_TRANSPORT: Transport type (development, smtp, etc.)
 * 
 * IMPORTANT:
 * - Default: EMAIL_ENABLED=false
 * - Development mode does NOT send real emails
 * - Does NOT require paid email provider
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly enabled: boolean;
  private readonly from: string;
  private readonly provider: EmailProvider;

  constructor() {
    this.enabled = process.env.EMAIL_ENABLED === 'true';
    this.from = process.env.EMAIL_FROM || 'no-reply@example.local';
    
    // Use development provider by default
    this.provider = new DevelopmentEmailProvider();

    if (!this.enabled) {
      this.logger.log('Email service is DISABLED');
    } else {
      this.logger.log(`Email service enabled (from: ${this.from})`);
    }
  }

  /**
   * Send an email
   * 
   * @param to Recipient email
   * @param subject Email subject
   * @param text Plain text content
   * @param html HTML content (optional)
   */
  async sendEmail(
    to: string,
    subject: string,
    text: string,
    html?: string,
  ): Promise<boolean> {
    if (!this.enabled) {
      this.logger.debug(`Email not sent (disabled): ${subject} to ${to}`);
      return false;
    }

    try {
      await this.provider.sendEmail(to, subject, text, html);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Send account passed email
   */
  async sendAccountPassedEmail(email: string, accountNumber: string) {
    const subject = '🎉 Congratulations! Challenge Passed';
    const text = `
Congratulations!

Your trading account ${accountNumber} has successfully passed the challenge.

This is a significant achievement, and we're excited to see your continued success.

Best regards,
Trading Platform Team
    `.trim();

    return this.sendEmail(email, subject, text);
  }

  /**
   * Send account breached email
   */
  async sendAccountBreachedEmail(
    email: string,
    accountNumber: string,
    reason?: string,
  ) {
    const subject = 'Challenge Breached Notification';
    const text = `
Hello,

We're writing to inform you that trading account ${accountNumber} has breached the challenge rules.

${reason ? `Reason: ${reason}` : ''}

You can review your account details and performance in your dashboard.

Best regards,
Trading Platform Team
    `.trim();

    return this.sendEmail(email, subject, text);
  }

  /**
   * Send payment completed email
   */
  async sendPaymentCompletedEmail(
    email: string,
    challengeName: string,
    amount: string,
  ) {
    const subject = 'Payment Successful';
    const text = `
Hello,

Your payment of $${amount} for ${challengeName} has been completed successfully.

Your trading account will be activated shortly.

Best regards,
Trading Platform Team
    `.trim();

    return this.sendEmail(email, subject, text);
  }

  /**
   * Send payment rejected email
   */
  async sendPaymentRejectedEmail(
    email: string,
    challengeName: string,
    amount: string,
  ) {
    const subject = 'Payment Failed';
    const text = `
Hello,

We were unable to process your payment of $${amount} for ${challengeName}.

Please try again or contact support if the problem persists.

Best regards,
Trading Platform Team
    `.trim();

    return this.sendEmail(email, subject, text);
  }
}
