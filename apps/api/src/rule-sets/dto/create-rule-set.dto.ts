import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateRuleSetDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;
}
