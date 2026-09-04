'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AdminLayout } from '@/components/layout/admin-layout';
import { useAuth } from '@/lib/auth-context';
import { adminApi, AuditLog } from '@/lib/admin-api';

export default function AdminAuditLogsPage() {
  const { accessToken } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const limit = 20;

  useEffect(() => {
    fetchLogs();
  }, [accessToken, page, actionFilter]);

  const fetchLogs = async () => {
    if (!accessToken) {
      setError('Authentication required');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const result = await adminApi.getAuditLogs(accessToken, {
        page,
        limit,
        search: search || undefined,
        action: actionFilter || undefined,
      });
      setLogs(result.data || []);
      setTotalPages(result.meta.totalPages || 1);
      setTotal(result.meta.total || 0);
    } catch (err: any) {
      console.error('Failed to load audit logs:', err);
      setError(err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const toggleLogDetails = (logId: string) => {
    setExpandedLog(expandedLog === logId ? null : logId);
  };

  return (
    <ProtectedRoute requireRole="ADMIN">
      <AdminLayout>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Audit Logs</h1>
              <p className="text-gray-600 mt-1">Complete audit trail of all admin actions</p>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow p-4">
            <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Search
                </label>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Action, entity type, entity ID..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Action Type
                </label>
                <select
                  value={actionFilter}
                  onChange={(e) => {
                    setActionFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Actions</option>
                  <option value="USER_STATUS_CHANGED">User Status Changed</option>
                  <option value="TRADING_ACCOUNT_STATUS_CHANGED">Account Status Changed</option>
                  <option value="TRADING_ACCOUNT_CREATED">Account Created</option>
                  <option value="ORDER_CREATED">Order Created</option>
                  <option value="PAYMENT_APPROVED">Payment Approved</option>
                  <option value="TEST_PAYMENT_COMPLETED">Test Payment</option>
                  <option value="CHALLENGE_CREATED">Challenge Created</option>
                  <option value="CHALLENGE_UPDATED">Challenge Updated</option>
                  <option value="CHALLENGE_STATUS_CHANGED">Challenge Status Changed</option>
                  <option value="RULESET_CREATED">Rule Set Created</option>
                  <option value="RULESET_UPDATED">Rule Set Updated</option>
                  <option value="TRADING_RULE_CREATED">Trading Rule Created</option>
                  <option value="TRADING_RULE_UPDATED">Trading Rule Updated</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  Search
                </button>
              </div>
            </form>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {/* Results Summary */}
          <div className="text-sm text-gray-600">
            Showing {logs.length} of {total} audit logs
          </div>

          {/* Audit Logs */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {loading ? (
              <div className="text-center py-12 text-gray-600">Loading audit logs...</div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12 text-gray-600">No audit logs found</div>
            ) : (
              <div className="divide-y divide-gray-200">
                {logs.map((log) => (
                  <div key={log.id} className="p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700 font-mono">
                                {log.action}
                              </span>
                              {log.entityType && (
                                <span className="text-xs text-gray-500">
                                  {log.entityType}
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-gray-900">
                              {log.actor ? (
                                <>
                                  <span className="font-semibold">
                                    {log.actor.firstName} {log.actor.lastName}
                                  </span>
                                  {' '}
                                  <span className="text-gray-600">({log.actor.email})</span>
                                  {' '}
                                  <span
                                    className={`px-1.5 py-0.5 text-xs rounded ${
                                      log.actor.role === 'ADMIN'
                                        ? 'bg-purple-100 text-purple-700'
                                        : 'bg-blue-100 text-blue-700'
                                    }`}
                                  >
                                    {log.actor.role}
                                  </span>
                                </>
                              ) : (
                                <span className="text-gray-500 italic">System</span>
                              )}
                            </div>
                            {log.entityId && (
                              <div className="text-xs text-gray-500 mt-1">
                                Entity ID: <span className="font-mono">{log.entityId}</span>
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 text-right">
                            {new Date(log.createdAt).toLocaleString()}
                          </div>
                        </div>

                        {/* Metadata */}
                        {log.metadata && (
                          <div className="mt-2">
                            <button
                              onClick={() => toggleLogDetails(log.id)}
                              className="text-xs text-blue-600 hover:text-blue-800"
                            >
                              {expandedLog === log.id ? '▼ Hide Details' : '▶ Show Details'}
                            </button>
                            {expandedLog === log.id && (
                              <div className="mt-2 bg-gray-50 rounded p-3 border border-gray-200">
                                <div className="text-xs font-mono text-gray-700 whitespace-pre-wrap">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}

          {/* Note */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> Audit logs are immutable and cannot be edited or deleted. They
              provide a complete audit trail for compliance and security purposes.
            </p>
          </div>
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
