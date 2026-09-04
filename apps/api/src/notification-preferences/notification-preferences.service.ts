import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateNotificationPreferencesDto } from './dto/update-preferences.dto';

/**
 * Notification Preferences Service
 * 
 * Manages user notification preferences.
 */
@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get user's notification preferences
   * Creates default if not exists
   */
  async getPreferences(userId: string) {
    let preferences = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!preferences) {
      preferences = await this.prisma.notificationPreference.create({
        data: {
          userId,
          inAppEnabled: true,
          emailEnabled: false,
          tradeNotifications: true,
          accountNotifications: true,
          challengeNotifications: true,
          orderNotifications: true,
          systemNotifications: true,
        },
      });
    }

    return preferences;
  }

  /**
   * Update notification preferences
   */
  async updatePreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ) {
    // Ensure preferences exist
    await this.getPreferences(userId);

    return this.prisma.notificationPreference.update({
      where: { userId },
      data: dto,
    });
  }
}
