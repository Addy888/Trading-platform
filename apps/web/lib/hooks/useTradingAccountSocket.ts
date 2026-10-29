import { useEffect, useState, useCallback } from 'react';
import { useSocket } from './useSocket';
import { subscribeToAccount, unsubscribeFromAccount } from '../socket';

/**
 * Trading Account Real-time Data
 */
export interface AccountRealtimeData {
  accountId: string;
  accountNumber: string;
  currentBalance: string;
  equity: string;
  unrealizedPnl: string;
  totalPnl: string;
  status: string;
  updatedAt: Date;
}

export interface PositionRealtimeData {
  tradeId: string;
  accountId: string;
  symbol: string;
  side: string;
  volume: string;
  entryPrice: string;
  currentPrice: string;
  unrealizedPnl: string;
  updatedAt: Date;
}

/**
 * Hook for trading account real-time updates
 */
export function useTradingAccountSocket(accountId: string | null, token?: string) {
  const { socket, isConnected, isAuthenticated, connectionState } = useSocket(token);
  const [accountData, setAccountData] = useState<AccountRealtimeData | null>(null);
  const [positions, setPositions] = useState<Record<string, PositionRealtimeData>>({});
  const [challengeProgress, setChallengeProgress] = useState<any>(null);
  const [recentTrades, setRecentTrades] = useState<any[]>([]);

  // Subscribe to account updates
  useEffect(() => {
    if (!socket || !isConnected || !isAuthenticated || !accountId) return;

    // Subscribe when connected
    subscribeToAccount(accountId);

    return () => {
      // Unsubscribe when component unmounts or accountId changes
      unsubscribeFromAccount(accountId);
    };
  }, [socket, isConnected, isAuthenticated, accountId]);

  // Handle account updates
  useEffect(() => {
    if (!socket) return;

    const handleAccountUpdate = (data: AccountRealtimeData) => {
      if (data.accountId === accountId) {
        setAccountData(data);
      }
    };

    const handlePositionUpdate = (data: PositionRealtimeData) => {
      if (data.accountId === accountId) {
        setPositions((prev) => ({
          ...prev,
          [data.tradeId]: data,
        }));
      }
    };

    const handleTradeOpened = (data: any) => {
      if (data.accountId === accountId) {
        setRecentTrades((prev) => [
          { ...data, type: 'opened', timestamp: data.openedAt },
          ...prev.slice(0, 49), // Keep last 50 trades
        ]);
      }
    };

    const handleTradeClosed = (data: any) => {
      if (data.accountId === accountId) {
        setRecentTrades((prev) => [
          { ...data, type: 'closed', timestamp: data.closedAt },
          ...prev.slice(0, 49),
        ]);
        
        // Remove from positions
        setPositions((prev) => {
          const updated = { ...prev };
          delete updated[data.tradeId];
          return updated;
        });
      }
    };

    const handleChallengeUpdate = (data: any) => {
      if (data.accountId === accountId) {
        setChallengeProgress(data);
      }
    };

    const handleAccountStatus = (data: any) => {
      if (data.accountId === accountId) {
        // Update account status
        if (accountData) {
          setAccountData({
            ...accountData,
            status: data.newStatus,
          });
        }
      }
    };

    socket.on('account:update', handleAccountUpdate);
    socket.on('position:update', handlePositionUpdate);
    socket.on('trade:opened', handleTradeOpened);
    socket.on('trade:closed', handleTradeClosed);
    socket.on('challenge:update', handleChallengeUpdate);
    socket.on('account:status', handleAccountStatus);

    return () => {
      socket.off('account:update', handleAccountUpdate);
      socket.off('position:update', handlePositionUpdate);
      socket.off('trade:opened', handleTradeOpened);
      socket.off('trade:closed', handleTradeClosed);
      socket.off('challenge:update', handleChallengeUpdate);
      socket.off('account:status', handleAccountStatus);
    };
  }, [socket, accountId, accountData]);

  // Refresh data on reconnect
  const refreshData = useCallback(async () => {
    // Trigger REST API fetch as fallback
    // This will be called by the component
  }, [accountId]);

  return {
    isConnected,
    connectionState,
    accountData,
    positions: Object.values(positions),
    challengeProgress,
    recentTrades,
    refreshData,
  };
}
