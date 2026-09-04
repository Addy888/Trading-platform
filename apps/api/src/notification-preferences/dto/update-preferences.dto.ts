import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsBoolean()
  @IsOptional()
  inAppEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  emailEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  tradeNotifications?: boolean;

  @IsBoolean()
  @IsOptional()
  accountNotifications?: boolean;

  @IsBoolean()
  @IsOptional()
  challengeNotifications?: boolean;

  @IsBoolean()
  @IsOptional()
  orderNotifications?: boolean;

  @IsBoolean()
  @IsOptional()
  systemNotifications?: boolean;
}
