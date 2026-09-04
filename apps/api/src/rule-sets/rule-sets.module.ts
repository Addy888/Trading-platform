import { Module } from '@nestjs/common';
import { RuleSetsService } from './rule-sets.service';
import { RuleSetsController } from './rule-sets.controller';

@Module({
  controllers: [RuleSetsController],
  providers: [RuleSetsService],
  exports: [RuleSetsService],
})
export class RuleSetsModule {}
