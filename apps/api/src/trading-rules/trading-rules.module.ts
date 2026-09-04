import { Module } from '@nestjs/common';
import { TradingRulesService } from './trading-rules.service';
import { TradingRulesController } from './trading-rules.controller';

@Module({
  controllers: [TradingRulesController],
  providers: [TradingRulesService],
  exports: [TradingRulesService],
})
export class TradingRulesModule {}
