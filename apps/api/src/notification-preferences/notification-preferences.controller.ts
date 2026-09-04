import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationPreferencesService } from './notification-preferences.service';
import { UpdateNotificationPreferencesDto } from './dto/update-preferences.dto';

/**
 * Notification Preferences Controller
 * 
 * REST API for managing notification preferences.
 */
@Controller('notification-preferences')
@UseGuards(JwtAuthGuard)
export class NotificationPreferencesController {
  constructor(
    private readonly preferencesService: NotificationPreferencesService,
  ) {}

  /**
   * Get user's notification preferences
   * 
   * GET /api/notification-preferences
   */
  @Get()
  getPreferences(@CurrentUser('sub') userId: string) {
    return this.preferencesService.getPreferences(userId);
  }

  /**
   * Update notification preferences
   * 
   * PATCH /api/notification-preferences
   */
  @Patch()
  updatePreferences(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.preferencesService.updatePreferences(userId, dto);
  }
}
