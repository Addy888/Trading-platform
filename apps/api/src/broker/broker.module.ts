import { Module } from '@nestjs/common';
import { BrokerController } from './broker.controller';
import { BrokerService } from './broker.service';
import { BrokerConnectionService } from './broker-connection.service';
import { BrokerPortfolioSyncService } from './broker-portfolio-sync.service';
import { AngelOneAdapter } from './providers/angelone/angelone.adapter';
import { AngelOnePortfolioAdapter } from './providers/angelone/angelone-portfolio.adapter';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BrokerController],
  providers: [
    BrokerService,
    BrokerConnectionService,
    BrokerPortfolioSyncService,
    AngelOneAdapter,
    AngelOnePortfolioAdapter,
  ],
  exports: [BrokerService, BrokerConnectionService, BrokerPortfolioSyncService],
})
export class BrokerModule {}
