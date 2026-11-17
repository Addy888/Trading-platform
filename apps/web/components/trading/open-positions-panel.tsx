'use client';

import { useEffect, useState } from 'react';
import { tradingApi, type OpenPosition, type TradingAccount } from '@/lib/trading-api';
import { useAuth } from '@/lib/auth-context';
import { ClosePositionDialog } from './close-position-dialog';

interface OpenPositionsPanelProps {
  account: TradingAccount;
  onPositionClosed?: () => void;
}

export function OpenPositionsPanel({ account, onPositionClosed }: OpenPositionsPanelProps) {
  const { accessToken } = useAuth();
  const [positions, setPositions] = useState<OpenPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closingPositionId, setClosingPositionId] = useState<string | null>(null);
  const [closingError, setClosingError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<OpenPosition | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    loadPositions();
  }, [account.id, accessToken]);

  const loadPositions = async () => {
    if (!accessToken) return;
    try {
      setLoading(true);
      setError(null);
      const data = await tradingApi.getOpenPositions(accessToken, account.id);
      setPositions(data || []);
    } catch (err: any) {
      console.error('Failed to load open positions:', err);
      setError(err.message || 'Failed to load open positions');
    } finally {
      setLoading(false);
    }
  };

  const handleClosePosition = async () => {
    if (!accessToken || !selectedPosition) return;
    try {
      setIsConfirming(true);
      setClosingPositionId(selectedPosition.id);
      setClosingError(null);
      
      const result = await tradingApi.closeTrade(accessToken, account.id, selectedPosition.id);
      
      // Remove the closed position from list
      setPositions(positions.filter((p) => p.id !== selectedPosition.id));
      setDialogOpen(false);
      setSelectedPosition(null);
      setClosingPositionId(null);
      setIsConfirming(false);
      
      // Notify parent
      onPositionClosed?.();
    } catch (err: any) {
      console.error('Failed to close position:', err);
      setClosingError(err.message || 'Failed to close position');
      setClosingPositionId(null);
      setIsConfirming(false);
    }
  };

  const handleOpenDialog = (position: OpenPosition) => {
    // Only allow BUY positions to be closed
    if (position.side !== 'BUY') {
      setClosingError('Only BUY positions can be closed directly');
      return;
    }
    setSelectedPosition(position);
    setDialogOpen(true);
    setClosingError(null);
  };

  const formatCurrency = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const formatPrice = (value: string | number | null, decimals: number = 5) => {
    if (value === null) return '-';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? '-' : num.toFixed(decimals);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Open Positions</h2>
        <div className="text-center py-8 text-gray-600">Loading positions...</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-900">Open Positions</h2>
        <span className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded-full">
          {positions.length} {positions.length === 1 ? 'position' : 'positions'}
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {closingError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-800 text-sm">{closingError}</p>
        </div>
      )}

      {positions.length === 0 ? (
        <div className="text-center py-12 text-gray-600">
          <p>No open positions</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Symbol
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Side
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Volume
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Entry Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Current Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unrealized P&L
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stop Loss
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Take Profit
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Opened At
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {positions.map((position) => {
                  const pnlNum = parseFloat(position.unrealizedPnl || '0');
                  const isBuy = position.side === 'BUY';
                  const isClosing = closingPositionId === position.id;
                  
                  return (
                    <tr key={position.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-semibold text-gray-900">{position.symbol}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs rounded font-medium ${
                            position.side === 'BUY'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {position.side}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {position.volume}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                        {formatPrice(position.entryPrice)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                        {formatPrice(position.currentPrice)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`text-sm font-semibold ${
                            pnlNum >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {formatCurrency(position.unrealizedPnl || '0')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                        {position.stopLoss ? formatPrice(position.stopLoss) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                        {position.takeProfit ? formatPrice(position.takeProfit) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(position.openedAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {isBuy ? (
                          <button
                            onClick={() => handleOpenDialog(position)}
                            disabled={isClosing}
                            className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
                          >
                            {isClosing ? 'Closing...' : 'Sell / Close'}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-500">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Close Position Dialog */}
          {selectedPosition && (
            <ClosePositionDialog
              isOpen={dialogOpen}
              symbol={selectedPosition.symbol}
              side={selectedPosition.side}
              quantity={selectedPosition.volume}
              entryPrice={selectedPosition.entryPrice}
              currentPrice={selectedPosition.currentPrice}
              unrealizedPnl={selectedPosition.unrealizedPnl}
              isLoading={isConfirming}
              onConfirm={handleClosePosition}
              onCancel={() => {
                setDialogOpen(false);
                setSelectedPosition(null);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
