import { IsString, IsOptional, IsEnum, IsArray, IsObject } from 'class-validator';
import { NotificationType, NotificationPriority } from '@prisma/client';

export class SendNotificationDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userIds?: string[];

  @IsOptional()
  @IsString()
  broadcastToAll?: 'true' | 'false';

  @IsEnum(NotificationType)
  type: NotificationType;

  @IsEnum(NotificationPriority)
  @IsOptional()
  priority?: NotificationPriority;

  @IsString()
  title: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsObject()
  data?: any;
}
