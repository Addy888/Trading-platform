import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';

/**
 * Notifications Controller
 * 
 * REST API for managing user notifications.
 * 
 * All endpoints require authentication.
 * Users can only access their own notifications.
 */
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Get user's notifications
   * 
   * GET /api/notifications?page=1&limit=20&read=false&type=TRADE_OPENED
   */
  @Get()
  findAll(
    @CurrentUser('sub') userId: string,
    @Query() query: QueryNotificationsDto,
  ) {
    return this.notificationsService.findAll(userId, query);
  }

  /**
   * Get unread notification count
   * 
   * GET /api/notifications/unread-count
   */
  @Get('unread-count')
  getUnreadCount(@CurrentUser('sub') userId: string) {
    return this.notificationsService.getUnreadCount(userId).then((count) => ({
      unreadCount: count,
    }));
  }

  /**
   * Mark notification as read
   * 
   * PATCH /api/notifications/:id/read
   */
  @Patch(':id/read')
  markAsRead(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.notificationsService.markAsRead(id, userId);
  }

  /**
   * Mark all notifications as read
   * 
   * PATCH /api/notifications/read-all
   */
  @Patch('read-all')
  markAllAsRead(@CurrentUser('sub') userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }

  /**
   * Delete notification
   * 
   * DELETE /api/notifications/:id
   */
  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.notificationsService.delete(id, userId);
  }
}
