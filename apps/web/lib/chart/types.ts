/**
 * Chart Types and Interfaces
 * Common types used across chart components, drawing tools, and indicators
 */

import type { Time } from 'lightweight-charts';

// ── Timeframe Types ──────────────────────────────────────────

export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1H' | '4H' | '1D';

export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  '1m': '1 Minute',
  '5m': '5 Minutes',
  '15m': '15 Minutes',
  '30m': '30 Minutes',
  '1H': '1 Hour',
  '4H': '4 Hours',
  '1D': '1 Day',
};

// Timeframe intervals in milliseconds
export const TF_INTERVAL_MS: Record<Timeframe, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1H': 3_600_000,
  '4H': 14_400_000,
  '1D': 86_400_000,
};

// ── Candle Data ──────────────────────────────────────────────

export interface CandleData {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

// ── Drawing Tool Types ───────────────────────────────────────

export type DrawingTool = 'none' | 'trend' | 'horizontal' | 'vertical' | 'rectangle' | 'fibonacci';

export type MagnetMode = 'off' | 'weak' | 'strong';

export interface DrawingLine {
  id: string;
  type: DrawingTool;
  points: DrawingPoint[];
  style: DrawingStyle;
  locked?: boolean;
  visible?: boolean;
  label?: string;
  createdAt: number;
  modifiedAt: number;
}

export interface DrawingPoint {
  time: Time;
  price: number;
}

export interface DrawingStyle {
  color: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  extendLeft?: boolean;
  extendRight?: boolean;
  showLabels?: boolean;
  labelColor?: string;
}

export const DEFAULT_DRAWING_STYLE: DrawingStyle = {
  color: '#2196F3',
  lineWidth: 2,
  lineStyle: 'solid',
  extendLeft: false,
  extendRight: false,
  showLabels: true,
  labelColor: '#FFFFFF',
};

// ── Indicator Types ──────────────────────────────────────────

export type IndicatorType = 'SMA' | 'EMA' | 'RSI' | 'MACD' | 'BOLL' | 'ATR' | 'STOCH' | 'VWAP';

export type IndicatorPane = 'overlay' | 'below';

export interface IndicatorConfig {
  id: string;
  type: IndicatorType;
  params: Record<string, number>;
  style: IndicatorStyle;
  enabled: boolean;
  pane: IndicatorPane;
}

export interface IndicatorStyle {
  color: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
}

export interface IndicatorPoint {
  time: number;
  value: number;
}

// ── Chart Colors ─────────────────────────────────────────────

export interface ChartColors {
  background: string;
  textColor: string;
  gridColor: string;
  borderColor: string;
  up: string; // Bullish candle
  down: string; // Bearish candle
  volumeUp: string;
  volumeDown: string;
  crosshair: string;
  bidLine: string;
  askLine: string;
  midLine: string;
  bidLabelBg: string;
  askLabelBg: string;
  tpLine: string; // Take Profit
  slLine: string; // Stop Loss
  orderLine: string; // Pending orders
}

export const CHART_COLORS_DARK: ChartColors = {
  background: '#1a1a1a',
  textColor: '#d1d4dc',
  gridColor: '#2a2a2a',
  borderColor: '#2a2a2a',
  up: '#22c55e', // Green
  down: '#ef4444', // Red
  volumeUp: '#22c55e80',
  volumeDown: '#ef444480',
  crosshair: '#758696',
  bidLine: '#0ecb81',
  askLine: '#f6465d',
  midLine: '#7aa2ff',
  bidLabelBg: '#0ecb81',
  askLabelBg: '#f6465d',
  tpLine: '#0ecb81',
  slLine: '#f6465d',
  orderLine: '#ffa726',
};

export const CHART_COLORS_LIGHT: ChartColors = {
  background: '#ffffff',
  textColor: '#191919',
  gridColor: '#e6e6e6',
  borderColor: '#e6e6e6',
  up: '#26a69a',
  down: '#ef5350',
  volumeUp: '#26a69a80',
  volumeDown: '#ef535080',
  crosshair: '#9598a1',
  bidLine: '#089981',
  askLine: '#f23645',
  midLine: '#2962ff',
  bidLabelBg: '#089981',
  askLabelBg: '#f23645',
  tpLine: '#089981',
  slLine: '#f23645',
  orderLine: '#ff6d00',
};

// ── Chart State ──────────────────────────────────────────────

export type ConnectionState =
  | 'CONNECTED'
  | 'CONNECTING'
  | 'DISCONNECTED'
  | 'STALE'
  | 'HISTORICAL_ONLY'
  | 'POLLING'
  | 'MARKET_CLOSED'
  | 'ERROR';

export interface ChartState {
  symbol: string;
  timeframe: Timeframe;
  connectionState: ConnectionState;
  lastUpdate: Date | null;
  dataAgeMinutes: number;
  candles: CandleData[];
  drawings: DrawingLine[];
  indicators: IndicatorConfig[];
}

// ── Utility Functions ────────────────────────────────────────

/**
 * Convert timestamp to Unix seconds for Lightweight Charts
 */
export function toUnixSeconds(timestamp: string | number | Date): number {
  if (typeof timestamp === 'string') {
    return Math.floor(Date.parse(timestamp) / 1000);
  }
  if (typeof timestamp === 'number') {
    // Assume milliseconds if very large, seconds otherwise
    return timestamp > 10_000_000_000 ? Math.floor(timestamp / 1000) : timestamp;
  }
  return Math.floor(timestamp.getTime() / 1000);
}

/**
 * Convert timestamp to Unix milliseconds
 */
export function toUnixMs(timestamp: string | number | Date): number {
  if (typeof timestamp === 'string') {
    return Date.parse(timestamp);
  }
  if (typeof timestamp === 'number') {
    // Assume milliseconds if very large, seconds otherwise
    return timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  }
  return timestamp.getTime();
}

/**
 * Get the candle bucket time for a given timestamp and timeframe
 * Used for aggregating ticks into candles
 */
export function getCandleBucketTime(timestampMs: number, timeframe: Timeframe): number {
  const intervalMs = TF_INTERVAL_MS[timeframe];
  return Math.floor(timestampMs / intervalMs) * intervalMs / 1000; // Return in seconds
}

/**
 * Format price with appropriate decimal places
 */
export function formatPrice(price: number, pipDigits: number = 5): string {
  return price.toFixed(pipDigits);
}

/**
 * Format volume with K/M suffix
 */
export function formatVolume(volume: number): string {
  if (volume >= 1_000_000) {
    return `${(volume / 1_000_000).toFixed(2)}M`;
  }
  if (volume >= 1_000) {
    return `${(volume / 1_000).toFixed(2)}K`;
  }
  return volume.toFixed(0);
}

/**
 * Generate unique ID for drawings/indicators
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Validate OHLC constraints
 */
export function isValidOHLC(candle: CandleData): boolean {
  const { open, high, low, close } = candle;
  
  if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
    return false;
  }
  
  if (open <= 0 || high <= 0 || low <= 0 || close <= 0) {
    return false;
  }
  
  const maxPrice = Math.max(open, close);
  const minPrice = Math.min(open, close);
  
  if (high < maxPrice || high < low) {
    return false;
  }
  
  if (low > minPrice || low > high) {
    return false;
  }
  
  return true;
}

/**
 * Sort and deduplicate candles
 */
export function sanitizeCandles(candles: CandleData[]): CandleData[] {
  // Sort by time ascending
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  
  // Remove duplicates (keep last occurrence)
  const unique: CandleData[] = [];
  const seen = new Set<number>();
  
  for (let i = sorted.length - 1; i >= 0; i--) {
    const candle = sorted[i];
    if (!seen.has(candle.time) && isValidOHLC(candle)) {
      unique.unshift(candle);
      seen.add(candle.time);
    }
  }
  
  return unique;
}
