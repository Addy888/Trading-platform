'use client';

import { useState, useEffect } from 'react';

interface OrderPanelProps {
  symbol: string;
  bid: string;
  ask: string;
  spread: string;
  balance: string;
  equity: string;
  freeMargin?: string;
  usedMargin?: string;
  onTrade: (trade: {
    side: 'BUY' | 'SELL';
    volume: number;
    stopLoss?: number;
    takeProfit?: number;
  }) => Promise<void>;
  disabled?: boolean;
  disabledReason?: string;
}

export function OrderPanel({
  symbol,
  bid,
  ask,
  spread,
  balance,
  equity,
  freeMargin,
  usedMargin,
  onTrade,
  disabled,
  disabledReason
}: OrderPanelProps) {
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [volume, setVolume] = useState('0.01');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [processing, setProcessing] = useState(false);

  const formatPrice = (price: string) => {
    const num = parseFloat(price);
    if (isNaN(num)) return '-.-----';
    
    if (symbol.includes('JPY')) return num.toFixed(3);
    if (symbol.includes('XAU') || symbol.includes('XAG') || symbol.includes('WTI')) return num.toFixed(2);
    if (symbol.includes('BTC') || symbol.includes('ETH')) return num.toFixed(2);
    return num.toFixed(5);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const vol = parseFloat(volume);
    if (isNaN(vol) || vol <= 0) {
      alert('Invalid volume');
      return;
    }

    const sl = stopLoss ? parseFloat(stopLoss) : undefined;
    const tp = takeProfit ? parseFloat(takeProfit) : undefined;

    if (sl !== undefined && isNaN(sl)) {
      alert('Invalid stop loss');
      return;
    }

    if (tp !== undefined && isNaN(tp)) {
      alert('Invalid take profit');
      return;
    }

    try {
      setProcessing(true);
      await onTrade({
        side,
        volume: vol,
        stopLoss: sl,
        takeProfit: tp,
      });
      
      // Clear SL/TP after successful trade
      setStopLoss('');
      setTakeProfit('');
    } catch (err) {
      // Error handling done by parent
    } finally {
      setProcessing(false);
    }
  };

  const executionPrice = side === 'BUY' ? ask : bid;

  return (
    <div className="bg-gray-900 text-white p-4 h-full overflow-y-auto">
      <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wide">
        Order Panel
      </h3>
      
      {disabled && disabledReason && (
        <div className="mb-4 p-3 bg-red-900 bg-opacity-30 border border-red-700 rounded text-sm text-red-300">
          <div className="font-semibold mb-1">Trading Disabled</div>
          <div>{disabledReason}</div>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Symbol & Price Display */}
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">Symbol</div>
          <div className="text-lg font-bold mb-3">{symbol}</div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-gray-400 mb-1">BID (Sell)</div>
              <div className="font-mono text-red-400 text-sm font-semibold">
                {formatPrice(bid)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">ASK (Buy)</div>
              <div className="font-mono text-green-400 text-sm font-semibold">
                {formatPrice(ask)}
              </div>
            </div>
          </div>
          
          <div className="mt-2 pt-2 border-t border-gray-700">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Spread:</span>
              <span className="font-mono text-gray-300">{parseFloat(spread).toFixed(1)}</span>
            </div>
          </div>
        </div>

        {/* Side Selector */}
        <div>
          <label className="text-xs text-gray-400 block mb-2">Side</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSide('BUY')}
              className={`py-2 px-4 rounded font-semibold transition-colors ${
                side === 'BUY'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              BUY
            </button>
            <button
              type="button"
              onClick={() => setSide('SELL')}
              className={`py-2 px-4 rounded font-semibold transition-colors ${
                side === 'SELL'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              SELL
            </button>
          </div>
          <div className="mt-2 text-xs text-gray-400">
            Execution: <span className="font-mono text-white">{formatPrice(executionPrice)}</span>
          </div>
        </div>

        {/* Volume */}
        <div>
          <label className="text-xs text-gray-400 block mb-2">Volume (Lots)</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            disabled={disabled || processing}
          />
          <div className="mt-1 text-xs text-gray-400">
            Min: 0.01 | Step: 0.01
          </div>
        </div>

        {/* Stop Loss */}
        <div>
          <label className="text-xs text-gray-400 block mb-2">
            Stop Loss (Optional)
          </label>
          <input
            type="number"
            step="0.00001"
            value={stopLoss}
            onChange={(e) => setStopLoss(e.target.value)}
            placeholder={side === 'BUY' ? '< Entry price' : '> Entry price'}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            disabled={disabled || processing}
          />
        </div>

        {/* Take Profit */}
        <div>
          <label className="text-xs text-gray-400 block mb-2">
            Take Profit (Optional)
          </label>
          <input
            type="number"
            step="0.00001"
            value={takeProfit}
            onChange={(e) => setTakeProfit(e.target.value)}
            placeholder={side === 'BUY' ? '> Entry price' : '< Entry price'}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            disabled={disabled || processing}
          />
        </div>

        {/* Account Info */}
        <div className="bg-gray-800 rounded p-3 text-xs space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-400">Balance:</span>
            <span className="font-mono">${parseFloat(balance).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Equity:</span>
            <span className="font-mono">${parseFloat(equity).toFixed(2)}</span>
          </div>
          {freeMargin && (
            <div className="flex justify-between">
              <span className="text-gray-400">Free Margin:</span>
              <span className="font-mono text-green-400">${parseFloat(freeMargin).toFixed(2)}</span>
            </div>
          )}
          {usedMargin && (
            <div className="flex justify-between">
              <span className="text-gray-400">Used Margin:</span>
              <span className="font-mono text-yellow-400">${parseFloat(usedMargin).toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={disabled || processing}
          className={`w-full py-3 rounded font-semibold transition-colors text-white ${
            side === 'BUY'
              ? 'bg-green-600 hover:bg-green-700 disabled:bg-gray-700'
              : 'bg-red-600 hover:bg-red-700 disabled:bg-gray-700'
          } disabled:cursor-not-allowed`}
        >
          {processing ? (
            <span>Processing...</span>
          ) : disabled ? (
            <span>Trading Disabled</span>
          ) : (
            <span className="flex items-center justify-center">
              <span className="mr-2">{side} {volume}</span>
              <span className="text-sm opacity-75">@ {formatPrice(executionPrice)}</span>
            </span>
          )}
        </button>
      </form>
    </div>
  );
}
