'use client';

import { useEffect, useState } from 'react';

interface PreviewData {
  balance: string;
  equity: string;
  pnl: string;
  pnlPercent: string;
}

export function DashboardPreview() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Simulated preview data (clearly labeled as preview)
  const previewData: PreviewData = {
    balance: '50,000.00',
    equity: '52,450.00',
    pnl: '+2,450.00',
    pnlPercent: '+4.9',
  };

  const markets = [
    { symbol: 'EUR/USD', bid: '1.08542', ask: '1.08557', change: '+0.23%', positive: true },
    { symbol: 'GBP/USD', bid: '1.26234', ask: '1.26249', change: '-0.15%', positive: false },
    { symbol: 'USD/JPY', bid: '149.856', ask: '149.871', change: '+0.41%', positive: true },
    { symbol: 'XAU/USD', bid: '2042.35', ask: '2042.85', change: '+1.12%', positive: true },
  ];

  const recentTrades = [
    { symbol: 'EUR/USD', type: 'BUY', profit: '+145.20', positive: true },
    { symbol: 'GBP/USD', type: 'SELL', profit: '+89.50', positive: true },
    { symbol: 'XAU/USD', type: 'BUY', profit: '-32.10', positive: false },
  ];

  if (!mounted) return null;

  return (
    <section className="relative -mt-32 pb-20 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Preview label */}
        <div className="text-center mb-6">
          <span className="inline-block px-4 py-2 bg-[#101310]/80 backdrop-blur-xl border border-[#B8FF85]/30 text-[#B8FF85] text-sm font-semibold rounded-full">
            Live Trading Interface Preview
          </span>
        </div>

        {/* Main Dashboard Preview Card */}
        <div className="glass-effect rounded-2xl overflow-hidden shadow-2xl border border-white/10 animate-fade-in-up">
          {/* Top Bar */}
          <div className="bg-gradient-to-r from-[#101310] to-[#0a0d0a] px-6 py-4 border-b border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-[#999F99] text-sm ml-4">Trading Terminal</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-[#B8FF85] rounded-full animate-pulse"></div>
                <span className="text-[#999F99] text-xs">Live</span>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-12 gap-0">
            {/* Sidebar - Market Watch */}
            <div className="lg:col-span-3 bg-[#0a0d0a]/50 p-4 border-r border-white/10">
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[#F5F7F4] text-sm font-semibold">Market Watch</h3>
                  <div className="w-2 h-2 bg-[#B8FF85] rounded-full animate-pulse"></div>
                </div>
                {markets.map((market, i) => (
                  <div
                    key={i}
                    className="bg-[#101310]/60 p-3 rounded-lg border border-white/5 hover:border-[#B8FF85]/30 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[#F5F7F4] text-sm font-medium">
                        {market.symbol}
                      </span>
                      <span
                        className={`text-xs ${
                          market.positive ? 'text-[#B8FF85]' : 'text-red-400'
                        }`}
                      >
                        {market.change}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-[#999F99]">BID</div>
                        <div className="text-red-400 font-mono">{market.bid}</div>
                      </div>
                      <div>
                        <div className="text-[#999F99]">ASK</div>
                        <div className="text-[#B8FF85] font-mono">{market.ask}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Main Content Area */}
            <div className="lg:col-span-9 p-6 bg-[#070908]/40">
              {/* Account Stats */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-[#101310]/60 p-4 rounded-lg border border-white/10">
                  <div className="text-[#999F99] text-xs mb-1">Balance</div>
                  <div className="text-[#F5F7F4] text-lg font-bold">
                    ${previewData.balance}
                  </div>
                </div>
                <div className="bg-[#101310]/60 p-4 rounded-lg border border-white/10">
                  <div className="text-[#999F99] text-xs mb-1">Equity</div>
                  <div className="text-[#F5F7F4] text-lg font-bold">
                    ${previewData.equity}
                  </div>
                </div>
                <div className="bg-[#101310]/60 p-4 rounded-lg border border-[#B8FF85]/30 glow-green-soft">
                  <div className="text-[#999F99] text-xs mb-1">Profit/Loss</div>
                  <div className="text-[#B8FF85] text-lg font-bold">
                    ${previewData.pnl}
                  </div>
                </div>
                <div className="bg-[#101310]/60 p-4 rounded-lg border border-white/10">
                  <div className="text-[#999F99] text-xs mb-1">ROI</div>
                  <div className="text-[#B8FF85] text-lg font-bold">
                    {previewData.pnlPercent}%
                  </div>
                </div>
              </div>

              {/* Chart Area Placeholder */}
              <div className="bg-[#0a0d0a]/60 rounded-lg border border-white/10 p-4 mb-6 h-64 flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0">
                  {/* Simulated chart lines */}
                  <svg className="w-full h-full opacity-40" viewBox="0 0 600 200">
                    <polyline
                      points="0,150 50,140 100,120 150,130 200,100 250,110 300,80 350,90 400,60 450,70 500,50 550,55 600,40"
                      fill="none"
                      stroke="url(#gradient)"
                      strokeWidth="2"
                    />
                    <defs>
                      <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#B8FF85" />
                        <stop offset="50%" stopColor="#06b6d4" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
                <div className="relative z-10 text-center">
                  <div className="text-[#F5F7F4] text-sm font-semibold mb-1">
                    Advanced Charting
                  </div>
                  <div className="text-[#999F99] text-xs">
                    Real-time price analysis & indicators
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div>
                <h4 className="text-[#F5F7F4] text-sm font-semibold mb-3">
                  Recent Positions
                </h4>
                <div className="space-y-2">
                  {recentTrades.map((trade, i) => (
                    <div
                      key={i}
                      className="bg-[#101310]/60 p-3 rounded-lg border border-white/10 flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-4">
                        <span className="text-[#F5F7F4] text-sm font-medium">
                          {trade.symbol}
                        </span>
                        <span
                          className={`px-2 py-1 text-xs rounded ${
                            trade.type === 'BUY'
                              ? 'bg-[#B8FF85]/20 text-[#B8FF85]'
                              : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {trade.type}
                        </span>
                      </div>
                      <span
                        className={`text-sm font-semibold ${
                          trade.positive ? 'text-[#B8FF85]' : 'text-red-400'
                        }`}
                      >
                        {trade.profit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Note about preview data */}
        <div className="text-center mt-6">
          <p className="text-[#999F99] text-xs">
            * Preview interface with illustrative data. Actual trading data comes from live market feeds.
          </p>
        </div>
      </div>
    </section>
  );
}
