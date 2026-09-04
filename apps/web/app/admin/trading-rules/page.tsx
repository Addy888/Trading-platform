'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AdminLayout } from '@/components/layout/admin-layout';
import { useAuth } from '@/lib/auth-context';
import { tradingRulesApi, TradingRule, CreateTradingRuleDto } from '@/lib/trading-rules-api';

export default function TradingRulesPage() {
  const { accessToken } = useAuth();
  const [rules, setRules] = useState<TradingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<TradingRule | null>(null);
  const [formData, setFormData] = useState<CreateTradingRuleDto>({
    name: '',
    description: '',
    type: 'PROFIT_TARGET',
    value: 0,
    isPercentage: false,
  });

  useEffect(() => {
    fetchRules();
  }, [accessToken]);

  const fetchRules = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      const data = await tradingRulesApi.getAll(accessToken);
      setRules(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load trading rules');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingRule(null);
    setFormData({
      name: '',
      description: '',
      type: 'PROFIT_TARGET',
      value: 0,
      isPercentage: false,
    });
    setShowModal(true);
  };

  const handleEdit = (rule: TradingRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      description: rule.description || '',
      type: rule.type,
      value: parseFloat(rule.value),
      isPercentage: rule.isPercentage,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;

    try {
      if (editingRule) {
        await tradingRulesApi.update(accessToken, editingRule.id, formData);
      } else {
        await tradingRulesApi.create(accessToken, formData);
      }
      setShowModal(false);
      fetchRules();
    } catch (err: any) {
      setError(err.message || 'Failed to save trading rule');
    }
  };

  const handleToggleStatus = async (rule: TradingRule) => {
    if (!accessToken) return;

    try {
      await tradingRulesApi.updateStatus(accessToken, rule.id, !rule.isActive);
      fetchRules();
    } catch (err: any) {
      setError(err.message || 'Failed to update status');
    }
  };

  const getRuleTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      PROFIT_TARGET: 'Profit Target',
      DAILY_LOSS: 'Daily Loss',
      MAX_DRAWDOWN: 'Max Drawdown',
      MIN_TRADING_DAYS: 'Min Trading Days',
    };
    return labels[type] || type;
  };

  return (
    <ProtectedRoute requireRole="ADMIN">
      <AdminLayout>
        <div>
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Trading Rules</h1>
            <button
              onClick={handleCreate}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              + Create Rule
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="text-center py-12 text-gray-600">Loading...</div>
          ) : rules.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <p className="text-gray-600 mb-4">No trading rules yet</p>
              <button
                onClick={handleCreate}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                Create Your First Rule
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rules.map((rule) => (
                    <tr key={rule.id}>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{rule.name}</div>
                        {rule.description && (
                          <div className="text-sm text-gray-500">{rule.description}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {getRuleTypeLabel(rule.type)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {rule.value}{rule.isPercentage ? '%' : ''}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            rule.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {rule.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-sm space-x-2">
                        <button
                          onClick={() => handleEdit(rule)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleStatus(rule)}
                          className={rule.isActive ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'}
                        >
                          {rule.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">
                  {editingRule ? 'Edit Trading Rule' : 'Create Trading Rule'}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Name
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Type
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      required
                    >
                      <option value="PROFIT_TARGET">Profit Target</option>
                      <option value="DAILY_LOSS">Daily Loss</option>
                      <option value="MAX_DRAWDOWN">Max Drawdown</option>
                      <option value="MIN_TRADING_DAYS">Min Trading Days</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Value
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.value}
                      onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      required
                    />
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="isPercentage"
                      checked={formData.isPercentage}
                      onChange={(e) => setFormData({ ...formData, isPercentage: e.target.checked })}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                    />
                    <label htmlFor="isPercentage" className="ml-2 text-sm text-gray-700">
                      Value is a percentage
                    </label>
                  </div>

                  <div className="flex justify-end space-x-2 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      {editingRule ? 'Update' : 'Create'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
