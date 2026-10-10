'use client';

interface MarketWatchProps {
  symbols: string[];
  quotes: Record<string, { bid: string; ask: string; spread: string }>;
  selectedSymbol: string;
  onSymbolSelect: (symbol: string) => void;
  loading?: boolean;
  dataSource?: 'TWELVEDATA' | 'SIMULATED';
}

export function MarketWatch({ 
  symbols, 
  quotes, 
  selectedSymbol, 
  onSymbolSelect,
  loading = false,
  dataSource = 'SIMULATED'
}: MarketWatchProps) {
  const formatPrice = (price: string, decimals: number = 5) => {
    const num = parseFloat(price);
    return isNaN(num) ? '-.-----' : num.toFixed(decimals);
  };

  const getDecimals = (symbol: string): number => {
    if (symbol.includes('JPY')) return 3;
    if (symbol.includes('XAU') || symbol.includes('XAG') || symbol.includes('WTI')) return 2;
    if (symbol.includes('BTC') || symbol.includes('ETH')) return 2;
    return 5;
  };

  return (
    <div className="bg-gray-900 text-white p-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
          Market Watch
        </h3>
        {loading && (
          <div className="text-xs text-blue-400 flex items-center gap-1">
            <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Updating...</span>
          </div>
        )}
      </div>
      
      {dataSource && (
        <div className="mb-3 px-2 py-1 bg-gray-800 rounded text-xs text-gray-400 text-center">
          Source: {dataSource === 'TWELVEDATA' ? 'Live (Twelve Data)' : 'Simulated'}
        </div>
      )}
      
      <div className="space-y-1">
        {symbols.map((symbol) => {
          const quote = quotes[symbol];
          const bid = quote?.bid || '0';
          const ask = quote?.ask || '0';
          const spread = quote?.spread || '0';
          const isSelected = symbol === selectedSymbol;
          const decimals = getDecimals(symbol);

          return (
            <button
              key={symbol}
              onClick={() => onSymbolSelect(symbol)}
              className={`w-full text-left p-3 rounded transition-colors border ${
                isSelected
                  ? 'bg-blue-600 hover:bg-blue-700 border-blue-500'
                  : 'bg-gray-800 hover:bg-gray-750 border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm">{symbol}</span>
                <span className="text-xs text-gray-400">
                  {parseFloat(spread).toFixed(decimals > 3 ? 1 : decimals)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-gray-400 mb-1">BID</div>
                  <div className="font-mono text-red-400 font-semibold">
                    {formatPrice(bid, decimals)}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 mb-1">ASK</div>
                  <div className="font-mono text-green-400 font-semibold">
                    {formatPrice(ask, decimals)}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
