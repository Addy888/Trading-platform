'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface MarketData {
  symbol: string;
  price: string;
  change: string;
  changePercent: string;
}

export function MarketTicker() {
  const [marketData, setMarketData] = useState<MarketData[]>([
    { symbol: 'EUR/USD', price: '1.0845', change: '+0.0012', changePercent: '+0.11%' },
    { symbol: 'GBP/USD', price: '1.2634', change: '-0.0023', changePercent: '-0.18%' },
    { symbol: 'USD/JPY', price: '149.82', change: '+0.45', changePercent: '+0.30%' },
    { symbol: 'AUD/USD', price: '0.6512', change: '+0.0008', changePercent: '+0.12%' },
    { symbol: 'USD/CAD', price: '1.3598', change: '-0.0015', changePercent: '-0.11%' },
    { symbol: 'EUR/GBP', price: '0.8587', change: '+0.0005', changePercent: '+0.06%' },
  ]);

  // Duplicate for seamless scrolling
  const duplicatedData = [...marketData, ...marketData];

  return (
    <section className="relative bg-[#0A0A0F] border-y border-white/5 overflow-hidden py-6">
      <div className="absolute inset-0 bg-gradient-to-r from-[#00A3FF]/5 via-transparent to-[#00A3FF]/5" />
      
      <div className="relative flex items-center gap-8 animate-scroll-ticker">
        {duplicatedData.map((item, index) => {
          const isPositive = parseFloat(item.change) >= 0;
          return (
            <div
              key={`${item.symbol}-${index}`}
              className="flex items-center gap-3 px-6 py-3 bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg whitespace-nowrap"
            >
              <span className="text-sm font-bold text-white">{item.symbol}</span>
              <span className="text-sm font-mono text-gray-300">{item.price}</span>
              <div className={`flex items-center gap-1 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isPositive ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                <span className="text-xs font-semibold">{item.changePercent}</span>
              </div>
            </div>
          );
        })}
      </div>

      <style jsx>{`
        @keyframes scroll-ticker {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animate-scroll-ticker {
          animation: scroll-ticker 30s linear infinite;
        }
      `}</style>
    </section>
  );
}
