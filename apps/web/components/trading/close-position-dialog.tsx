'use client';

import { useState } from 'react';

interface ClosePositionDialogProps {
  isOpen: boolean;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: string;
  entryPrice: string;
  currentPrice: string | null;
  unrealizedPnl: string | null;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ClosePositionDialog({
  isOpen,
  symbol,
  side,
  quantity,
  entryPrice,
  currentPrice,
  unrealizedPnl,
  isLoading,
  onConfirm,
  onCancel,
}: ClosePositionDialogProps) {
  if (!isOpen) return null;

  const formatPrice = (value: string | number | null, decimals: number = 5) => {
    if (value === null) return '-';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? '-' : num.toFixed(decimals);
  };

  const formatCurrency = (value: string | number | null) => {
    if (value === null) return '-';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const pnlNum = unrealizedPnl ? parseFloat(unrealizedPnl) : 0;
  const pnlColor = pnlNum >= 0 ? 'text-green-600' : 'text-red-600';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-4 text-white rounded-t-lg">
          <h2 className="text-xl font-bold">Close Position</h2>
          <p className="text-red-100 text-sm">Close this {side} position?</p>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          <div className="space-y-4">
            {/* Symbol & Side */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Instrument</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{symbol}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Direction</p>
                <p className="mt-1">
                  <span
                    className={`px-3 py-1 text-sm font-medium rounded ${
                      side === 'BUY' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {side}
                  </span>
                </p>
              </div>
            </div>

            {/* Divider */}
            <hr className="border-gray-200" />

            {/* Position Details */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">Quantity</p>
                <p className="text-sm font-semibold text-gray-900">{quantity}</p>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">Entry Price</p>
                <p className="text-sm font-mono text-gray-900">{formatPrice(entryPrice)}</p>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">Closing Price</p>
                <p className="text-sm font-mono text-gray-900">{formatPrice(currentPrice)}</p>
              </div>
            </div>

            {/* Divider */}
            <hr className="border-gray-200" />

            {/* Estimated P&L */}
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs font-medium text-gray-500 uppercase mb-2">Estimated P&L</p>
              <p className={`text-2xl font-bold ${pnlColor}`}>{formatCurrency(unrealizedPnl)}</p>
              <p className="text-xs text-gray-500 mt-1">Based on current market price</p>
            </div>

            {/* Warning */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-xs text-yellow-800">
                <span className="font-semibold">Warning:</span> This action will close the position
                immediately and realize the P&L shown above.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex gap-3 bg-gray-50 rounded-b-lg">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition"
          >
            {isLoading ? 'Closing...' : 'Close Position'}
          </button>
        </div>
      </div>
    </div>
  );
}
