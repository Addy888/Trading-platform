import { IsString, IsNotEmpty } from 'class-validator';

export class AddRuleDto {
  @IsString()
  @IsNotEmpty()
  ruleId: string;
}
