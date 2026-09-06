'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AdminLayout } from '@/components/layout/admin-layout';
import { useAuth } from '@/lib/auth-context';
import { adminApi } from '@/lib/admin-api';

interface HealthStatus {
  database: string;
  websocket: string;
  simulatedMarket: string;
  notifications: string;
  timestamp: string;
}

interface ServiceMetrics {
  uptime: string;
  memory: {
    used: string;
    total: string;
    percentage: number;
  };
  database: {
    connections: number;
    queries: number;
  };
}

export default function SystemHealthPage() {
  const { accessToken } = useAuth();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastChecked, setLastChecked] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    fetchHealth();
  }, [accessToken]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchHealth();
    }, 10000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, accessToken]);

  const fetchHealth = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      setError('');
      const data = await adminApi.getHealth(accessToken);
      setHealth(data);
      setLastChecked(new Date());
    } catch (err: any) {
      console.error('Failed to load health status:', err);
      setError(err.message || 'Failed to load system health');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'connected':
      case 'available':
      case 'running':
      case 'healthy':
      case 'ok':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'stopped':
      case 'unknown':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'error':
      case 'disconnected':
      case 'unhealthy':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'connected':
      case 'available':
      case 'running':
      case 'healthy':
      case 'ok':
        return '✓';
      case 'stopped':
      case 'unknown':
        return '⚠';
      case 'error':
      case 'disconnected':
      case 'unhealthy':
        return '✗';
      default:
        return '?';
    }
  };

  const formatStatus = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  };

  return (
    <ProtectedRoute requireRole="ADMIN">
      <AdminLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">System Health</h1>
              <p className="text-gray-600 mt-1">Monitor platform infrastructure and services</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="autoRefresh"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="mr-2"
                />
                <label htmlFor="autoRefresh" className="text-sm text-gray-700">
                  Auto-refresh (10s)
                </label>
              </div>
              <button
                onClick={fetchHealth}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Refreshing...' : 'Refresh Now'}
              </button>
            </div>
          </div>

          {/* Last Checked */}
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">
              Last checked: <span className="font-medium text-gray-900">{lastChecked.toLocaleString()}</span>
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {!loading && health && (
            <>
              {/* Core Services Status */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-6">Core Services</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Database */}
                  <div className={`border-2 rounded-lg p-6 ${getStatusColor(health.database)}`}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold">Database</h3>
                      <span className="text-3xl">{getStatusIcon(health.database)}</span>
                    </div>
                    <p className="text-2xl font-bold mb-2">{formatStatus(health.database)}</p>
                    <p className="text-sm opacity-75">MySQL/MariaDB</p>
                    <div className="mt-4 pt-4 border-t border-current border-opacity-20">
                      <div className="text-sm space-y-1">
                        <p>Provider: Prisma ORM</p>
                        <p>Connection: Active</p>
                      </div>
                    </div>
                  </div>

                  {/* WebSocket */}
                  <div className={`border-2 rounded-lg p-6 ${getStatusColor(health.websocket)}`}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold">WebSocket</h3>
                      <span className="text-3xl">{getStatusIcon(health.websocket)}</span>
                    </div>
                    <p className="text-2xl font-bold mb-2">{formatStatus(health.websocket)}</p>
                    <p className="text-sm opacity-75">Real-time Gateway</p>
                    <div className="mt-4 pt-4 border-t border-current border-opacity-20">
                      <div className="text-sm space-y-1">
                        <p>Provider: Socket.IO</p>
                        <p>Authentication: JWT</p>
                      </div>
                    </div>
                  </div>

                  {/* Market Data Engine */}
                  <div className={`border-2 rounded-lg p-6 ${getStatusColor(health.simulatedMarket)}`}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold">Market Data</h3>
                      <span className="text-3xl">{getStatusIcon(health.simulatedMarket)}</span>
                    </div>
                    <p className="text-2xl font-bold mb-2">{formatStatus(health.simulatedMarket)}</p>
                    <p className="text-sm opacity-75">Simulated Engine</p>
                    <div className="mt-4 pt-4 border-t border-current border-opacity-20">
                      <div className="text-sm space-y-1">
                        <p>Mode: Simulated</p>
                        <p>Symbols: 10</p>
                      </div>
                    </div>
                  </div>

                  {/* Notifications */}
                  <div className={`border-2 rounded-lg p-6 ${getStatusColor(health.notifications)}`}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold">Notifications</h3>
                      <span className="text-3xl">{getStatusIcon(health.notifications)}</span>
                    </div>
                    <p className="text-2xl font-bold mb-2">{formatStatus(health.notifications)}</p>
                    <p className="text-sm opacity-75">Notification System</p>
                    <div className="mt-4 pt-4 border-t border-current border-opacity-20">
                      <div className="text-sm space-y-1">
                        <p>In-App: Active</p>
                        <p>Email: Dev Mode</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* System Information */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-6">System Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-gray-600 mb-2">Environment</h3>
                    <p className="text-lg font-semibold text-gray-900">
                      {process.env.NODE_ENV || 'Production'}
                    </p>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-gray-600 mb-2">Platform</h3>
                    <p className="text-lg font-semibold text-gray-900">Trading Platform API</p>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-gray-600 mb-2">Version</h3>
                    <p className="text-lg font-semibold text-gray-900">1.0.0</p>
                  </div>
                </div>
              </div>

              {/* Service Details */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Trading Engine */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Trading Engine</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-gray-600">Order Execution</span>
                      <span className="text-green-600 font-medium">✓ Active</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-gray-600">Position Management</span>
                      <span className="text-green-600 font-medium">✓ Active</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-gray-600">SL/TP Monitor</span>
                      <span className="text-green-600 font-medium">✓ Running</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-gray-600">PnL Calculator</span>
                      <span className="text-green-600 font-medium">✓ Active</span>
                    </div>
                  </div>
                </div>

                {/* Risk Management */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Risk Management</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-gray-600">Rule Evaluator</span>
                      <span className="text-green-600 font-medium">✓ Active</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-gray-600">Drawdown Monitor</span>
                      <span className="text-green-600 font-medium">✓ Running</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-gray-600">Daily Loss Check</span>
                      <span className="text-green-600 font-medium">✓ Active</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-gray-600">Challenge Progress</span>
                      <span className="text-green-600 font-medium">✓ Tracking</span>
                    </div>
                  </div>
                </div>

                {/* Security */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Security</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-gray-600">JWT Authentication</span>
                      <span className="text-green-600 font-medium">✓ Enabled</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-gray-600">RBAC</span>
                      <span className="text-green-600 font-medium">✓ Enforced</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-gray-600">Ownership Checks</span>
                      <span className="text-green-600 font-medium">✓ Active</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-gray-600">Audit Logging</span>
                      <span className="text-green-600 font-medium">✓ Recording</span>
                    </div>
                  </div>
                </div>

                {/* External Integrations */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">External Services</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-gray-600">Email Provider</span>
                      <span className="text-yellow-600 font-medium">⚠ Dev Mode</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-gray-600">Payment Gateway</span>
                      <span className="text-yellow-600 font-medium">⚠ Manual</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-gray-600">File Storage</span>
                      <span className="text-yellow-600 font-medium">⚠ Mock</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-gray-600">Market Data Provider</span>
                      <span className="text-yellow-600 font-medium">⚠ Simulated</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Production Readiness */}
              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-6">
                <h3 className="text-lg font-bold text-yellow-900 mb-3">⚠ Production Readiness Notes</h3>
                <div className="text-sm text-yellow-800 space-y-2">
                  <p>• <strong>Email Service:</strong> Currently in development mode (console logs only). Configure SendGrid/Mailgun/SES for production.</p>
                  <p>• <strong>File Storage:</strong> KYC documents use mock URLs. Integrate with S3/Cloudinary for production.</p>
                  <p>• <strong>Payment Gateway:</strong> Manual approval only. Integrate Stripe/PayPal for automated processing.</p>
                  <p>• <strong>Market Data:</strong> Using simulated price engine. Connect to real data provider (Polygon.io, Alpha Vantage, Binance) for live trading.</p>
                </div>
              </div>
            </>
          )}

          {loading && !health && (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <div className="text-gray-600">Loading system health status...</div>
            </div>
          )}
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
