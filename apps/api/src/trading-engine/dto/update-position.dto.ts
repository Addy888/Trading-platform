import { IsNumber, IsOptional, Min } from 'class-validator';

export class UpdatePositionDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  stopLoss?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  takeProfit?: number;
}
