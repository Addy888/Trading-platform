import { IsEnum, IsOptional, IsString, IsDate } from 'class-validator';

export enum BrokerStatus {
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  EXPIRED = 'EXPIRED',
  ERROR = 'ERROR',
  NOT_CONFIGURED = 'NOT_CONFIGURED',
}

export class ConnectionStatusDto {
  @IsString()
  provider: string;

  @IsEnum(BrokerStatus)
  status: BrokerStatus;

  @IsOptional()
  @IsDate()
  lastConnectedAt?: Date;

  @IsOptional()
  @IsString()
  lastError?: string;

  @IsOptional()
  @IsString()
  lastErrorCode?: string;
}
