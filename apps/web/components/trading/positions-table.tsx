'use client';

import { useState } from 'react';

interface Position {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  volume: string;
  entryPrice: string;
  currentPrice: string;
  unrealizedPnl: string;
  stopLoss?: string;
  takeProfit?: string;
  openedAt: string;
}

interface PositionsTableProps {
  positions: Position[];
  onClose: (positionId: string) => void;
  onModify: (positionId: string, sl?: number, tp?: number) => void;
}

export function PositionsTable({ positions, onClose, onModify }: PositionsTableProps) {
  const [modifyingId, setModifyingId] = useState<string | null>(null);
  const [modifySL, setModifySL] = useState('');
  const [modifyTP, setModifyTP] = useState('');

  const handleModify = (positionId: string) => {
    const sl = modifySL ? parseFloat(modifySL) : undefined;
    const tp = modifyTP ? parseFloat(modifyTP) : undefined;
    
    onModify(positionId, sl, tp);
    setModifyingId(null);
    setModifySL('');
    setModifyTP('');
  };

  if (positions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        No open positions
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-800 text-gray-300">
          <tr>
            <th className="px-4 py-2 text-left">Symbol</th>
            <th className="px-4 py-2 text-left">Side</th>
            <th className="px-4 py-2 text-right">Volume</th>
            <th className="px-4 py-2 text-right">Entry Price</th>
            <th className="px-4 py-2 text-right">Current Price</th>
            <th className="px-4 py-2 text-right">P&L</th>
            <th className="px-4 py-2 text-right">SL</th>
            <th className="px-4 py-2 text-right">TP</th>
            <th className="px-4 py-2 text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((position) => {
            const pnl = parseFloat(position.unrealizedPnl);
            const isModifying = modifyingId === position.id;

            return (
              <tr key={position.id} className="border-b border-gray-700 hover:bg-gray-800">
                <td className="px-4 py-2 font-semibold">{position.symbol}</td>
                <td className="px-4 py-2">
                  <span
                    className={`px-2 py-1 rounded text-xs font-semibold ${
                      position.side === 'BUY'
                        ? 'bg-green-600 text-white'
                        : 'bg-red-600 text-white'
                    }`}
                  >
                    {position.side}
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-mono">{position.volume}</td>
                <td className="px-4 py-2 text-right font-mono">
                  {parseFloat(position.entryPrice).toFixed(5)}
                </td>
                <td className="px-4 py-2 text-right font-mono">
                  {parseFloat(position.currentPrice).toFixed(5)}
                </td>
                <td className={`px-4 py-2 text-right font-mono font-semibold ${
                  pnl >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs">
                  {position.stopLoss ? parseFloat(position.stopLoss).toFixed(5) : '-'}
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs">
                  {position.takeProfit ? parseFloat(position.takeProfit).toFixed(5) : '-'}
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-center gap-2">
                    {!isModifying ? (
                      <>
                        <button
                          onClick={() => {
                            setModifyingId(position.id);
                            setModifySL(position.stopLoss || '');
                            setModifyTP(position.takeProfit || '');
                          }}
                          className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
                        >
                          Modify
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Close position ${position.symbol}?`)) {
                              onClose(position.id);
                            }
                          }}
                          className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs"
                        >
                          Close
                        </button>
                      </>
                    ) : (
                      <div className="flex gap-1">
                        <input
                          type="number"
                          step="0.00001"
                          placeholder="SL"
                          value={modifySL}
                          onChange={(e) => setModifySL(e.target.value)}
                          className="w-20 px-1 py-1 bg-gray-700 rounded text-xs"
                        />
                        <input
                          type="number"
                          step="0.00001"
                          placeholder="TP"
                          value={modifyTP}
                          onChange={(e) => setModifyTP(e.target.value)}
                          className="w-20 px-1 py-1 bg-gray-700 rounded text-xs"
                        />
                        <button
                          onClick={() => handleModify(position.id)}
                          className="px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-xs"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => setModifyingId(null)}
                          className="px-2 py-1 bg-gray-600 hover:bg-gray-700 rounded text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
