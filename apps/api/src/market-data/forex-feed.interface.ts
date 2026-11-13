export type ForexConnectionState =
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'STALE'
  | 'HISTORICAL_ONLY'
  | 'POLLING'
  | 'MARKET_CLOSED'
  | 'ERROR';

export interface ForexTick {
  symbol: string;
  displaySymbol: string;
  price: number;
  providerTimestamp: Date;
  serverReceivedTimestamp: Date;
  feedMode: 'WEBSOCKET';
  provider: string;
}

export interface ForexCandleUpdate {
  symbol: string;
  timeframe: string;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  providerTimestamp: string;
  serverReceivedTimestamp: string;
}

export interface ForexFeed {
  readonly name: string;
  isConfigured(): boolean;
  getConnectionState(): ForexConnectionState;
  subscribe(symbol: string): Promise<void>;
  unsubscribe(symbol: string): Promise<void>;
  getRestriction(): string | null;
}
