/**
 * Email Provider Interface
 * 
 * Abstraction for email sending providers.
 * Allows switching between development and production providers.
 */
export interface EmailProvider {
  /**
   * Send an email
   * 
   * @param to Recipient email address
   * @param subject Email subject
   * @param text Plain text content
   * @param html HTML content (optional)
   */
  sendEmail(
    to: string,
    subject: string,
    text: string,
    html?: string,
  ): Promise<boolean>;
}
