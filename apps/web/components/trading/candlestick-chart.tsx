'use client';

import { useEffect, useRef } from 'react';
import { 
  createChart, 
  IChartApi, 
  ISeriesApi, 
  CandlestickData, 
  Time,
  CrosshairMode,
  CandlestickSeries as CandlestickSeriesType,
} from 'lightweight-charts';

interface CandlestickChartProps {
  data: Array<{ time: number; open: number; high: number; low: number; close: number }>;
  latestCandleUpdate?: { time: number; open: number; high: number; low: number; close: number } | null;
  symbol: string;
  timeframe: string;
  dataSource?: 'TWELVE_DATA';
  connectionState: 'CONNECTED' | 'CONNECTING' | 'STALE' | 'DISCONNECTED' | 'ERROR';
  latestPrice?: number;
  lastUpdatedAt?: string | null;
  serverFetchedAt?: string | null;
  quoteReceivedAt?: string | null;
  error?: string | null;
  renderError?: string | null;
  onChartError?: (message: string | null) => void;
  loading?: boolean;
  onRetry?: () => void;
}

export function CandlestickChart({ data, latestCandleUpdate, symbol, timeframe, dataSource, connectionState, latestPrice, lastUpdatedAt, serverFetchedAt, quoteReceivedAt, error, renderError, onChartError, loading = false, onRetry }: CandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const onChartErrorRef = useRef(onChartError);
  const hasLatestPrice = typeof latestPrice === 'number' && Number.isFinite(latestPrice) && latestPrice > 0;

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    let chart: IChartApi;
    let series: ISeriesApi<'Candlestick'>;
    try {
      chart = createChart(container, {
        width: container.clientWidth,
        height: Math.max(container.clientHeight, 320),
        layout: {
          background: { color: '#1a1a1a' },
          textColor: '#d1d4dc',
          attributionLogo: true,
        },
        grid: {
          vertLines: { color: '#2a2a2a' },
          horzLines: { color: '#2a2a2a' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
        },
        rightPriceScale: {
          borderColor: '#2a2a2a',
        },
        timeScale: {
          borderColor: '#2a2a2a',
          timeVisible: true,
          secondsVisible: false,
        },
      });

      series = chart.addSeries(CandlestickSeriesType, {
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      });
    } catch (chartInitializationError) {
      const detail = chartInitializationError instanceof Error
        ? chartInitializationError.message
        : String(chartInitializationError);
      onChartErrorRef.current?.(`Lightweight Charts initialization failed: ${detail}`);
      return;
    }

    chartRef.current = chart;
    candleSeriesRef.current = series;
    onChartErrorRef.current?.(null);

    const handleResize = () => {
      if (chartRef.current) {
        chartRef.current.applyOptions({
          width: container.clientWidth,
          height: Math.max(container.clientHeight, 320),
        });
      }
    };

    window.addEventListener('resize', handleResize);
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(handleResize);
    resizeObserver?.observe(container);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (candleSeriesRef.current && data.length > 0) {
      const formattedData: CandlestickData[] = data.map(d => ({
        time: d.time as Time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }));
      try {
        candleSeriesRef.current.setData(formattedData);
        chartRef.current?.timeScale().fitContent();
        onChartErrorRef.current?.(null);
      } catch (chartDataError) {
        const detail = chartDataError instanceof Error ? chartDataError.message : String(chartDataError);
        onChartErrorRef.current?.(`Lightweight Charts rejected historical candles: ${detail}`);
      }
    } else if (candleSeriesRef.current) {
      try {
        candleSeriesRef.current.setData([]);
      } catch (chartDataError) {
        const detail = chartDataError instanceof Error ? chartDataError.message : String(chartDataError);
        onChartErrorRef.current?.(`Lightweight Charts could not clear candle data: ${detail}`);
      }
    }
  }, [data]);

  useEffect(() => {
    const lastHistoryCandle = data.at(-1);
    if (!latestCandleUpdate || !candleSeriesRef.current) {
      return;
    }
    
    // ✅ FIXED: Only update if the new candle is newer or same timestamp as last history candle
    if (lastHistoryCandle && latestCandleUpdate.time < lastHistoryCandle.time) {
      console.warn('[CandlestickChart] Ignoring outdated candle update:', {
        updateTime: new Date(latestCandleUpdate.time * 1000).toISOString(),
        lastHistoryTime: new Date(lastHistoryCandle.time * 1000).toISOString()
      });
      return;
    }

    try {
      const updateData = {
        time: latestCandleUpdate.time as Time,
        open: latestCandleUpdate.open,
        high: latestCandleUpdate.high,
        low: latestCandleUpdate.low,
        close: latestCandleUpdate.close,
      };
      
      // ✅ Validate update data before applying
      const { open, high, low, close } = updateData;
      if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
        console.error('[CandlestickChart] Non-finite OHLC in update:', updateData);
        onChartErrorRef.current?.('Received invalid candle update: non-finite price values');
        return;
      }
      
      const maxPrice = Math.max(open, close);
      const minPrice = Math.min(open, close);
      
      if (high < maxPrice || high < low) {
        console.error('[CandlestickChart] OHLC violation in update (high):', updateData);
        onChartErrorRef.current?.(`Invalid candle update: high (${high.toFixed(5)}) must be >= max(open, close, low)`);
        return;
      }
      
      if (low > minPrice || low > high) {
        console.error('[CandlestickChart] OHLC violation in update (low):', updateData);
        onChartErrorRef.current?.(`Invalid candle update: low (${low.toFixed(5)}) must be <= min(open, close)`);
        return;
      }
      
      console.log('[CandlestickChart] Applying valid candle update:', {
        time: new Date(latestCandleUpdate.time * 1000).toISOString(),
        values: updateData,
        action: lastHistoryCandle && latestCandleUpdate.time === lastHistoryCandle.time ? 'update' : 'append'
      });
      
      candleSeriesRef.current.update(updateData);
      onChartErrorRef.current?.(null);
    } catch (chartUpdateError) {
      const detail = chartUpdateError instanceof Error ? chartUpdateError.message : String(chartUpdateError);
      console.error('[CandlestickChart] Update error:', detail);
      onChartErrorRef.current?.(`Lightweight Charts rejected a candle update: ${detail}`);
    }
  }, [data, latestCandleUpdate]);

  return (
    <div className="relative w-full h-full min-h-[320px]">
      <div className="absolute top-2 left-2 z-10 max-w-[calc(100%-1rem)] flex flex-wrap items-center gap-x-2 gap-y-1 bg-gray-900 bg-opacity-90 px-3 py-2 rounded">
        <span className="text-white font-semibold text-sm">{symbol}</span>
        <span className="text-gray-400 ml-2 text-xs">{timeframe}</span>
        {hasLatestPrice && (
          <span className="text-white ml-2 text-xs font-mono" title="Twelve Data last/display price; not an executable bid or ask.">
            Last · display-only {latestPrice?.toFixed(5)}
          </span>
        )}
        {lastUpdatedAt && Number.isFinite(Date.parse(lastUpdatedAt)) && (
          <span
            className="text-gray-400 ml-2 text-xs"
            title={`Provider quote timestamp: ${new Date(lastUpdatedAt).toISOString()}`}
          >
            Quote time: {new Date(lastUpdatedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
          </span>
        )}
        {serverFetchedAt && Number.isFinite(Date.parse(serverFetchedAt)) && (
          <span
            className="text-gray-400 ml-2 text-xs"
            title={`Server provider request completed: ${new Date(serverFetchedAt).toISOString()}`}
          >
            Server fetch: {new Date(serverFetchedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
          </span>
        )}
        {quoteReceivedAt && Number.isFinite(Date.parse(quoteReceivedAt)) && (
          <span className="text-gray-500 ml-2 text-xs" title={`Received by this web app: ${new Date(quoteReceivedAt).toISOString()}`}>
            App received: {new Date(quoteReceivedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
          </span>
        )}
        {data.length > 0 && (
          <span className="text-gray-500 ml-2 text-xs">• {data.length} candles</span>
        )}
        <span
          className={`ml-2 text-xs ${connectionState === 'CONNECTED' ? 'text-green-400' : connectionState === 'STALE' ? 'text-yellow-300' : connectionState === 'CONNECTING' ? 'text-blue-300' : 'text-red-300'}`}
          title={connectionState === 'STALE' ? 'The provider quote timestamp is older than the freshness threshold. Its subscription delay entitlement is not known.' : undefined}
        >
          {dataSource || 'Twelve Data'} · {connectionState === 'CONNECTED' ? 'quote available · polling' : connectionState === 'STALE' ? 'stale quote' : connectionState === 'CONNECTING' ? 'requesting quote' : connectionState === 'ERROR' ? 'quote request error' : 'no quote'}
        </span>
      </div>
      {(data.length === 0 || renderError) && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950 bg-opacity-50 z-20">
          <div className="text-center p-6 bg-gray-900 rounded-lg border border-gray-800">
            <p className="text-gray-400 text-sm font-semibold mb-1">
            {renderError ? 'Chart Error' : loading ? 'Loading Twelve Data candles…' : 'No Chart Data Available'}
            </p>
            <p className="text-gray-500 text-xs max-w-lg">
            {renderError || (loading ? 'Requesting genuine historical market data.' : error || 'Waiting for genuine Twelve Data candle data.')}
            </p>
            {!loading && onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 px-3 py-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-500"
              >
                Retry candle request
              </button>
            )}
          </div>
        </div>
      )}
      <div ref={chartContainerRef} className="w-full h-full min-h-[320px]" />
    </div>
  );
}
