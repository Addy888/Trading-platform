import { Injectable, Logger } from '@nestjs/common';
import { EmailProvider } from './email-provider.interface';

/**
 * Development Email Provider
 * 
 * For development mode - logs emails instead of sending them.
 * Does NOT send real emails.
 * 
 * IMPORTANT: Never log passwords, tokens, or secrets.
 */
@Injectable()
export class DevelopmentEmailProvider implements EmailProvider {
  private readonly logger = new Logger(DevelopmentEmailProvider.name);

  async sendEmail(
    to: string,
    subject: string,
    text: string,
    html?: string,
  ): Promise<boolean> {
    this.logger.log('=== DEVELOPMENT EMAIL ===');
    this.logger.log(`To: ${to}`);
    this.logger.log(`Subject: ${subject}`);
    this.logger.log(`Body: ${text}`);
    this.logger.log('========================');

    // Simulate successful send
    return true;
  }
}
