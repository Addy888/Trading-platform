export interface Candle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface CandleQuery {
  symbol: string;
  timeframe: '1m' | '5m' | '15m' | '1H' | '4H' | '1D';
  from?: number; // Unix timestamp
  to?: number; // Unix timestamp
  limit?: number;
}
