import { Module } from '@nestjs/common';
import { TradingEngineService } from './trading-engine.service';
import { TradingEngineV2Service } from './trading-engine-v2.service';
import { OrderGatewayService } from './order-gateway.service';
import { PreTradeRiskValidationService } from './pre-trade-risk-validation.service';
import { MarginService } from './margin.service';
import { SlTpMonitorService } from './sl-tp-monitor.service';
import { BalanceEquityService } from './balance-equity.service';
import { TradingEngineController } from './trading-engine.controller';
import { TradingEngineV2Controller } from './trading-engine-v2.controller';
import { AdminTradingController } from './admin-trading.controller';
import { SecureTradingController } from './secure-trading.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { RuleEvaluatorModule } from '../rule-evaluator/rule-evaluator.module';
import { RiskEngineModule } from '../risk-engine/risk-engine.module';
import { AccountSnapshotsModule } from '../account-snapshots/account-snapshots.module';
import { TradingAccountsModule } from '../trading-accounts/trading-accounts.module';
import { DailyLossModule } from '../daily-loss/daily-loss.module';
import { MaxDrawdownModule } from '../max-drawdown/max-drawdown.module';

@Module({
  imports: [
    PrismaModule,
    MarketDataModule,
    RuleEvaluatorModule,
    RiskEngineModule,
    AccountSnapshotsModule,
    TradingAccountsModule,
    DailyLossModule,
    MaxDrawdownModule,
  ],
  controllers: [
    TradingEngineController,
    TradingEngineV2Controller,
    AdminTradingController,
    SecureTradingController,
  ],
  providers: [
    TradingEngineService,
    TradingEngineV2Service,
    OrderGatewayService,
    PreTradeRiskValidationService,
    MarginService,
    SlTpMonitorService,
    BalanceEquityService,
  ],
  exports: [
    TradingEngineService,
    TradingEngineV2Service,
    OrderGatewayService,
    PreTradeRiskValidationService,
    MarginService,
    SlTpMonitorService,
    BalanceEquityService,
  ],
})
export class TradingEngineModule {}
