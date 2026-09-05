'use client';

interface Trade {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  volume: string;
  entryPrice: string;
  exitPrice?: string;
  realizedPnl: string;
  status: string;
  openedAt: string;
  closedAt?: string;
}

interface TradesTableProps {
  trades: Trade[];
}

export function TradesTable({ trades }: TradesTableProps) {
  if (trades.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        No trades yet
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
            <th className="px-4 py-2 text-right">Entry</th>
            <th className="px-4 py-2 text-right">Exit</th>
            <th className="px-4 py-2 text-right">P&L</th>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2 text-left">Opened</th>
            <th className="px-4 py-2 text-left">Closed</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => {
            const pnl = parseFloat(trade.realizedPnl);

            return (
              <tr key={trade.id} className="border-b border-gray-700 hover:bg-gray-800">
                <td className="px-4 py-2 font-semibold">{trade.symbol}</td>
                <td className="px-4 py-2">
                  <span
                    className={`px-2 py-1 rounded text-xs font-semibold ${
                      trade.side === 'BUY'
                        ? 'bg-green-600 text-white'
                        : 'bg-red-600 text-white'
                    }`}
                  >
                    {trade.side}
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-mono">{trade.volume}</td>
                <td className="px-4 py-2 text-right font-mono">
                  {parseFloat(trade.entryPrice).toFixed(5)}
                </td>
                <td className="px-4 py-2 text-right font-mono">
                  {trade.exitPrice ? parseFloat(trade.exitPrice).toFixed(5) : '-'}
                </td>
                <td className={`px-4 py-2 text-right font-mono font-semibold ${
                  pnl >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      trade.status === 'OPEN'
                        ? 'bg-blue-600 text-white'
                        : trade.status === 'CLOSED'
                        ? 'bg-gray-600 text-white'
                        : 'bg-yellow-600 text-white'
                    }`}
                  >
                    {trade.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-gray-400">
                  {new Date(trade.openedAt).toLocaleString()}
                </td>
                <td className="px-4 py-2 text-xs text-gray-400">
                  {trade.closedAt ? new Date(trade.closedAt).toLocaleString() : '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
