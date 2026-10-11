'use client';

import { useEffect, useRef } from 'react';
import { 
  createChart, 
  IChartApi, 
  ISeriesApi, 
  CandlestickData, 
  Time
} from 'lightweight-charts';

// Import CandlestickSeries from lightweight-charts package
import { CandlestickSeries } from 'lightweight-charts';

interface CandlestickChartProps {
  data: Array<{ time: number; open: number; high: number; low: number; close: number }>;
  symbol: string;
  timeframe: string;
}

export function CandlestickChart({ data, symbol, timeframe }: CandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 500,
      layout: {
        background: { color: '#1a1a1a' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#2a2a2a' },
        horzLines: { color: '#2a2a2a' },
      },
      crosshair: {
        mode: 1,
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

    // Add candlestick series (Lightweight Charts v5 API)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (candleSeriesRef.current && data.length > 0) {
      // Convert time from number to Time type for Lightweight Charts v5
      const formattedData = data.map(d => ({
        ...d,
        time: d.time as Time
      }));
      candleSeriesRef.current.setData(formattedData);
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }
    } else if (candleSeriesRef.current) {
      // Clear chart when no data
      candleSeriesRef.current.setData([]);
    }
  }, [data]);

  return (
    <div className="relative w-full">
      <div className="absolute top-2 left-2 z-10 bg-gray-900 bg-opacity-75 px-3 py-2 rounded">
        <span className="text-white font-semibold text-sm">{symbol}</span>
        <span className="text-gray-400 ml-2 text-xs">{timeframe}</span>
        {data.length > 0 && (
          <span className="text-gray-500 ml-2 text-xs">• {data.length} candles</span>
        )}
      </div>
      {data.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950 bg-opacity-50 z-20">
          <div className="text-center p-6 bg-gray-900 rounded-lg border border-gray-800">
            <svg className="w-12 h-12 mx-auto text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-gray-400 text-sm font-semibold mb-1">No Chart Data Available</p>
            <p className="text-gray-500 text-xs">
              Check the market data source or try a different symbol
            </p>
          </div>
        </div>
      )}
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}
