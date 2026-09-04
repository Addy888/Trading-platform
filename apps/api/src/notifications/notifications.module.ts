import { Module, forwardRef } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationEventsService } from './notification-events.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { WebSocketModule } from '../websocket/websocket.module';

/**
 * Notifications Module
 * 
 * Provides notification management and event handling.
 */
@Module({
  imports: [
    PrismaModule,
    EmailModule,
    forwardRef(() => WebSocketModule),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationEventsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
