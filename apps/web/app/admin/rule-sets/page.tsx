'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AdminLayout } from '@/components/layout/admin-layout';
import { useAuth } from '@/lib/auth-context';
import { ruleSetsApi, RuleSet, CreateRuleSetDto } from '@/lib/rule-sets-api';
import { tradingRulesApi, TradingRule } from '@/lib/trading-rules-api';
import { useRouter } from 'next/navigation';

export default function RuleSetsPage() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [availableRules, setAvailableRules] = useState<TradingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showAddRuleModal, setShowAddRuleModal] = useState(false);
  const [selectedRuleSet, setSelectedRuleSet] = useState<RuleSet | null>(null);
  const [editingRuleSet, setEditingRuleSet] = useState<RuleSet | null>(null);
  const [formData, setFormData] = useState<CreateRuleSetDto>({
    name: '',
    description: '',
  });
  const [selectedRuleId, setSelectedRuleId] = useState('');

  useEffect(() => {
    fetchRuleSets();
    fetchAvailableRules();
  }, [accessToken]);

  const fetchRuleSets = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      const data = await ruleSetsApi.getAll(accessToken);
      setRuleSets(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load rule sets');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableRules = async () => {
    if (!accessToken) return;

    try {
      const data = await tradingRulesApi.getAll(accessToken);
      setAvailableRules(data.filter(rule => rule.isActive));
    } catch (err: any) {
      console.error('Failed to load rules:', err);
    }
  };

  const handleCreate = () => {
    setEditingRuleSet(null);
    setFormData({
      name: '',
      description: '',
    });
    setShowModal(true);
  };

  const handleEdit = (ruleSet: RuleSet) => {
    setEditingRuleSet(ruleSet);
    setFormData({
      name: ruleSet.name,
      description: ruleSet.description || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;

    try {
      if (editingRuleSet) {
        await ruleSetsApi.update(accessToken, editingRuleSet.id, formData);
      } else {
        await ruleSetsApi.create(accessToken, formData);
      }
      setShowModal(false);
      fetchRuleSets();
    } catch (err: any) {
      setError(err.message || 'Failed to save rule set');
    }
  };

  const handleToggleStatus = async (ruleSet: RuleSet) => {
    if (!accessToken) return;

    try {
      await ruleSetsApi.updateStatus(accessToken, ruleSet.id, !ruleSet.isActive);
      fetchRuleSets();
    } catch (err: any) {
      setError(err.message || 'Failed to update status');
    }
  };

  const handleAddRuleClick = (ruleSet: RuleSet) => {
    setSelectedRuleSet(ruleSet);
    setSelectedRuleId('');
    setShowAddRuleModal(true);
  };

  const handleAddRule = async () => {
    if (!accessToken || !selectedRuleSet || !selectedRuleId) return;

    try {
      await ruleSetsApi.addRule(accessToken, selectedRuleSet.id, selectedRuleId);
      setShowAddRuleModal(false);
      fetchRuleSets();
    } catch (err: any) {
      setError(err.message || 'Failed to add rule');
    }
  };

  const handleRemoveRule = async (ruleSetId: string, ruleId: string) => {
    if (!accessToken) return;
    if (!confirm('Remove this rule from the set?')) return;

    try {
      await ruleSetsApi.removeRule(accessToken, ruleSetId, ruleId);
      fetchRuleSets();
    } catch (err: any) {
      setError(err.message || 'Failed to remove rule');
    }
  };

  return (
    <ProtectedRoute requireRole="ADMIN">
      <AdminLayout>
        <div>
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Rule Sets</h1>
            <button
              onClick={handleCreate}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              + Create Rule Set
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800">{error}</p>
              <button onClick={() => setError('')} className="text-red-600 text-sm underline mt-2">
                Dismiss
              </button>
            </div>
          )}

          {loading ? (
            <div className="text-center py-12 text-gray-600">Loading...</div>
          ) : ruleSets.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <p className="text-gray-600 mb-4">No rule sets yet</p>
              <button
                onClick={handleCreate}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                Create Your First Rule Set
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {ruleSets.map((ruleSet) => (
                <div key={ruleSet.id} className="bg-white rounded-lg shadow p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{ruleSet.name}</h3>
                      {ruleSet.description && (
                        <p className="text-sm text-gray-600 mt-1">{ruleSet.description}</p>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          ruleSet.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {ruleSet.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <button
                        onClick={() => handleEdit(ruleSet)}
                        className="text-blue-600 hover:text-blue-900 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleStatus(ruleSet)}
                        className={`text-sm ${ruleSet.isActive ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'}`}
                      >
                        {ruleSet.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-sm font-medium text-gray-700">Assigned Rules</h4>
                      <button
                        onClick={() => handleAddRuleClick(ruleSet)}
                        className="text-sm text-blue-600 hover:text-blue-900"
                      >
                        + Add Rule
                      </button>
                    </div>

                    {ruleSet.ruleSetRules.length === 0 ? (
                      <p className="text-sm text-gray-500">No rules assigned yet</p>
                    ) : (
                      <div className="space-y-2">
                        {ruleSet.ruleSetRules.map((rsr) => (
                          <div
                            key={rsr.id}
                            className="flex justify-between items-center bg-gray-50 p-3 rounded"
                          >
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {rsr.rule.name}
                              </div>
                              <div className="text-xs text-gray-600">
                                {rsr.rule.value}{rsr.rule.isPercentage ? '%' : ''}
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveRule(ruleSet.id, rsr.rule.id)}
                              className="text-red-600 hover:text-red-900 text-sm"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {showModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">
                  {editingRuleSet ? 'Edit Rule Set' : 'Create Rule Set'}
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
                      {editingRuleSet ? 'Update' : 'Create'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {showAddRuleModal && selectedRuleSet && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">Add Rule to {selectedRuleSet.name}</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Select Rule
                    </label>
                    <select
                      value={selectedRuleId}
                      onChange={(e) => setSelectedRuleId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      required
                    >
                      <option value="">-- Select a rule --</option>
                      {availableRules.map((rule) => (
                        <option key={rule.id} value={rule.id}>
                          {rule.name} ({rule.value}{rule.isPercentage ? '%' : ''})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex justify-end space-x-2 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowAddRuleModal(false)}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddRule}
                      disabled={!selectedRuleId}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      Add Rule
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
