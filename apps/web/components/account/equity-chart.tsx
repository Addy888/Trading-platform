'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { EquityHistoryPoint } from '@/lib/analytics-api';

interface EquityChartProps {
  data: EquityHistoryPoint[];
}

export function EquityChart({ data }: EquityChartProps) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No performance history available yet</p>
        <p className="text-sm mt-2">Performance data will appear as you trade</p>
      </div>
    );
  }

  const chartData = data.map((point) => ({
    timestamp: new Date(point.timestamp).toLocaleDateString(),
    balance: parseFloat(point.balance),
    equity: parseFloat(point.equity),
    totalPnl: parseFloat(point.totalPnl),
  }));

  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="timestamp" />
          <YAxis />
          <Tooltip
            formatter={(value: any) => {
              if (typeof value === 'number') {
                return `$${value.toFixed(2)}`;
              }
              return value;
            }}
            labelStyle={{ color: '#000' }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="balance"
            stroke="#3B82F6"
            name="Balance"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="equity"
            stroke="#10B981"
            name="Equity"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-500 text-center mt-2">
        Account Performance History (Simulated/Demo Trading)
      </p>
    </div>
  );
}
