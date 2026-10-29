import { IsOptional, IsInt, Min, Max, IsString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentStatusExtended } from '@prisma/client';

export class PaymentsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(PaymentStatusExtended)
  status?: PaymentStatusExtended;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
