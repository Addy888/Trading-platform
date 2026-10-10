import { Module } from '@nestjs/common';
import { BrokerOrderController } from './broker-order.controller';
import { BrokerOrderService } from './broker-order.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BrokerModule } from '../broker/broker.module';
import { TradingEngineModule } from '../trading-engine/trading-engine.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { AngelOneOrderAdapter } from '../broker/providers/angelone/angelone-order.adapter';
import { PaperOrderAdapter } from './adapters/paper-order.adapter';

/**
 * Broker Order Module
 * 
 * Day 3: Real Broker Order Execution
 * Day 6: Paper Trading Mode
 * 
 * Provides order placement, tracking, and cancellation
 * for SIMULATED, PAPER, and LIVE trading modes
 */
@Module({
  imports: [PrismaModule, BrokerModule, TradingEngineModule, MarketDataModule],
  controllers: [BrokerOrderController],
  providers: [BrokerOrderService, AngelOneOrderAdapter, PaperOrderAdapter],
  exports: [BrokerOrderService],
})
export class BrokerOrderModule {}
