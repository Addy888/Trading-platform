import { Module } from '@nestjs/common';
import { EmailService } from './email.service';

/**
 * Email Module
 * 
 * Provides email sending functionality.
 * 
 * Default: Development mode (no real emails sent)
 */
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
