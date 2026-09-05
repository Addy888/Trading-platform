'use client';

interface MarketWatchProps {
  symbols: string[];
  quotes: Record<string, { bid: string; ask: string; spread: string }>;
  selectedSymbol: string;
  onSymbolSelect: (symbol: string) => void;
}

export function MarketWatch({ symbols, quotes, selectedSymbol, onSymbolSelect }: MarketWatchProps) {
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
      <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide">
        Market Watch
      </h3>
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
