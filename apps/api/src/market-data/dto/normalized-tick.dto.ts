import Decimal from 'decimal.js';

/**
 * Market Data Source
 */
export enum MarketDataSource {
  SIMULATED = 'SIMULATED',
  ANGELONE_LIVE = 'ANGELONE_LIVE',
  TWELVEDATA = 'TWELVEDATA',
  UNAVAILABLE = 'UNAVAILABLE',
}

/**
 * Market Data Connection Status
 */
export enum MarketConnectionStatus {
  CONNECTED = 'CONNECTED',
  CONNECTING = 'CONNECTING',
  DISCONNECTED = 'DISCONNECTED',
  RECONNECTING = 'RECONNECTING',
  ERROR = 'ERROR',
  STALE = 'STALE',
}

/**
 * Market Data Status
 * 
 * Indicates the quality and timeliness of market data.
 * 
 * - LIVE: Real-time data from provider (WebSocket or verified fresh REST)
 * - DELAYED: Intentionally delayed data (15-min delay, etc.)
 * - STALE: Data age exceeds acceptable threshold
 * - CACHED: Served from cache (may or may not be stale)
 * - UNAVAILABLE: Provider not reachable or data not available
 * - UNKNOWN: Unable to determine data freshness/quality
 */
export enum MarketDataStatus {
  LIVE = 'LIVE',
  DELAYED = 'DELAYED',
  STALE = 'STALE',
  CACHED = 'CACHED',
  UNAVAILABLE = 'UNAVAILABLE',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Normalized Market Tick
 * 
 * Provider-agnostic market data structure.
 * All fields are optional except symbol and source.
 * 
 * Rules:
 * - Never invent missing data
 * - Preserve provider's price precision
 * - Distinguish exchange time from receipt time
 * - Reject invalid prices (negative, NaN, Infinity)
 */
export interface NormalizedTick {
  // Identity
  symbol: string;                      // Canonical symbol (e.g., "RELIANCE.NSE")
  source: MarketDataSource;            // Data source
  providerInstrumentId?: string;       // Provider's instrument token/ID
  exchange?: string;                   // Exchange/segment (e.g., "NSE", "BSE")
  
  // Prices
  lastTradedPrice?: Decimal;           // LTP - most recent trade price
  bid?: Decimal;                       // Best bid price
  ask?: Decimal;                       // Best ask price
  open?: Decimal;                      // Day open price
  high?: Decimal;                      // Day high price
  low?: Decimal;                       // Day low price
  close?: Decimal;                     // Previous day close
  
  // Quantities
  lastTradedQuantity?: number;         // LTQ - quantity of last trade
  bidQuantity?: number;                // Quantity at best bid
  askQuantity?: number;                // Quantity at best ask
  volume?: number;                     // Total volume traded today
  
  // Derived
  spread?: Decimal;                    // Bid-ask spread
  change?: Decimal;                    // Price change from previous close
  changePercent?: Decimal;             // Percentage change
  
  // Timestamps
  exchangeTimestamp?: Date;            // Exchange event time (if provided)
  receivedAt: Date;                    // Server receipt time
  
  // Status
  connectionStatus: MarketConnectionStatus;
  isStale: boolean;                    // Data freshness flag
  
  // Metadata
  tickSize?: Decimal;                  // Minimum price movement
  lotSize?: number;                    // Minimum quantity
}

/**
 * Market Data Status Response
 */
export interface MarketDataStatusDto {
  source: MarketDataSource;
  status: MarketConnectionStatus;
  connectedAt?: Date;
  lastTickAt?: Date;
  subscribedInstruments: number;
  supportedExchanges: string[];
  message?: string;
}

/**
 * Quote Request DTO
 */
export interface QuoteRequestDto {
  symbol: string;
  source?: MarketDataSource; // Optional - defaults to active source
}

/**
 * Quote Response DTO
 */
export interface QuoteResponseDto {
  symbol: string;
  source: MarketDataSource;
  tick: NormalizedTick | null;
  available: boolean;
  reason?: string; // Reason if unavailable
}

/**
 * Market Data Health Check
 */
export interface MarketDataHealthDto {
  overall: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  sources: {
    [key in MarketDataSource]?: {
      status: MarketConnectionStatus;
      tickCount: number;
      lastTickAge: number; // milliseconds
      errorCount: number;
    };
  };
  timestamp: Date;
}
