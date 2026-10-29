import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataManagerService } from '../market-data/market-data-manager.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly marketData: MarketDataManagerService,
  ) {}

  async getHealth() {
    let databaseStatus = 'unhealthy';
    
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      databaseStatus = 'healthy';
    } catch (error) {
      // Database is unhealthy
    }

    return {
      status: databaseStatus === 'healthy' ? 'ok' : 'degraded',
      service: 'tradeing-api',
      database: databaseStatus,
      marketData: this.marketData.getProviderStatus(),
    };
  }
}
