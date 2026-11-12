import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { TradeSide } from '@prisma/client';
import Decimal from 'decimal.js';
import { MarketDataEngineService } from './market-data-engine.service';

@Injectable()
export class MarketPriceService {
  constructor(private readonly marketData: MarketDataEngineService) {}

  getPrice(symbol: string): Decimal {
    const price = this.getAvailableMidPrice(symbol);
    if (price) return price;
    throw new ServiceUnavailableException(
      'Executable bid/ask market data is unavailable. Twelve Data display prices do not enable order execution.',
    );
  }

  getAvailableMidPrice(symbol: string): Decimal | null {
    if (!this.marketData.isMarketAvailable(symbol)) return null;
    return this.marketData.getMidPrice(symbol);
  }

  getAvailableExitPrice(symbol: string, side: TradeSide): Decimal | null {
    if (!this.marketData.isMarketAvailable(symbol)) return null;
    return side === TradeSide.BUY
      ? this.marketData.getBid(symbol)
      : this.marketData.getAsk(symbol);
  }

  getEntryPrice(symbol: string, side: TradeSide): Decimal {
    if (!this.marketData.isMarketAvailable(symbol)) {
      throw new ServiceUnavailableException(
        'A fresh executable bid/ask quote is required to open a position.',
      );
    }
    const price = side === TradeSide.BUY
      ? this.marketData.getAsk(symbol)
      : this.marketData.getBid(symbol);
    if (!price) {
      throw new ServiceUnavailableException(
        'A fresh executable bid/ask quote is required to open a position.',
      );
    }
    return price;
  }

  getExitPrice(symbol: string, side: TradeSide): Decimal {
    const price = this.getAvailableExitPrice(symbol, side);
    if (!price) {
      throw new ServiceUnavailableException(
        'A fresh executable bid/ask quote is required to value or close a position.',
      );
    }
    return price;
  }

  getSupportedSymbols(): string[] {
    return this.marketData.getSupportedSymbols();
  }

  isSymbolSupported(symbol: string): boolean {
    return this.marketData.isSymbolSupported(symbol);
  }

  getPriceSource(): string {
    return 'TWELVE_DATA';
  }
}
