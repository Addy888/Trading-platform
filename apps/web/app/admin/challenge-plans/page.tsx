'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AdminLayout } from '@/components/layout/admin-layout';
import { useAuth } from '@/lib/auth-context';
import { challengePlansApi, ChallengePlan, CreateChallengePlanDto } from '@/lib/challenge-plans-api';
import { ruleSetsApi, RuleSet } from '@/lib/rule-sets-api';

export default function ChallengePlansPage() {
  const { accessToken } = useAuth();
  const [plans, setPlans] = useState<ChallengePlan[]>([]);
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<ChallengePlan | null>(null);
  const [formData, setFormData] = useState<CreateChallengePlanDto>({
    name: '',
    description: '',
    accountSize: 0,
    price: 0,
    currency: 'USD',
    ruleSetId: '',
  });

  useEffect(() => {
    fetchPlans();
    fetchRuleSets();
  }, [accessToken]);

  const fetchPlans = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      const data = await challengePlansApi.getAllAdmin(accessToken);
      setPlans(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load challenge plans');
    } finally {
      setLoading(false);
    }
  };

  const fetchRuleSets = async () => {
    if (!accessToken) return;

    try {
      const data = await ruleSetsApi.getAll(accessToken);
      setRuleSets(data.filter(rs => rs.isActive));
    } catch (err: any) {
      console.error('Failed to load rule sets:', err);
    }
  };

  const handleCreate = () => {
    setEditingPlan(null);
    setFormData({
      name: '',
      description: '',
      accountSize: 0,
      price: 0,
      currency: 'USD',
      ruleSetId: '',
    });
    setShowModal(true);
  };

  const handleEdit = (plan: ChallengePlan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      description: plan.description || '',
      accountSize: parseFloat(plan.accountSize),
      price: parseFloat(plan.price),
      currency: plan.currency,
      ruleSetId: plan.ruleSetId,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;

    try {
      if (editingPlan) {
        await challengePlansApi.update(accessToken, editingPlan.id, formData);
      } else {
        await challengePlansApi.create(accessToken, formData);
      }
      setShowModal(false);
      fetchPlans();
    } catch (err: any) {
      setError(err.message || 'Failed to save challenge plan');
    }
  };

  const handleUpdateStatus = async (plan: ChallengePlan, status: 'DRAFT' | 'ACTIVE' | 'INACTIVE') => {
    if (!accessToken) return;

    try {
      await challengePlansApi.updateStatus(accessToken, plan.id, status);
      fetchPlans();
    } catch (err: any) {
      setError(err.message || 'Failed to update status');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800';
      case 'INACTIVE':
        return 'bg-red-100 text-red-800';
      case 'DRAFT':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <ProtectedRoute requireRole="ADMIN">
      <AdminLayout>
        <div>
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Challenge Plans</h1>
            <button
              onClick={handleCreate}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              + Create Plan
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
          ) : plans.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <p className="text-gray-600 mb-4">No challenge plans yet</p>
              <button
                onClick={handleCreate}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                Create Your First Plan
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {plans.map((plan) => (
                <div key={plan.id} className="bg-white rounded-lg shadow-lg overflow-hidden">
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(plan.status)}`}>
                        {plan.status}
                      </span>
                    </div>

                    {plan.description && (
                      <p className="text-sm text-gray-600 mb-4">{plan.description}</p>
                    )}

                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Account Size:</span>
                        <span className="font-semibold text-gray-900">
                          {plan.currency} {parseFloat(plan.accountSize).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Price:</span>
                        <span className="font-semibold text-green-600">
                          {plan.currency} {parseFloat(plan.price).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="border-t pt-4 mb-4">
                      <div className="text-xs font-medium text-gray-700 mb-2">Rule Set: {plan.ruleSet.name}</div>
                      <div className="space-y-1">
                        {plan.ruleSet.ruleSetRules.map((rsr) => (
                          <div key={rsr.id} className="text-xs text-gray-600 flex items-center">
                            <span className="mr-1">•</span>
                            <span>{rsr.rule.name}: {rsr.rule.value}{rsr.rule.isPercentage ? '%' : ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-between items-center space-x-2 pt-4 border-t">
                      <button
                        onClick={() => handleEdit(plan)}
                        className="text-sm text-blue-600 hover:text-blue-900"
                      >
                        Edit
                      </button>

                      <div className="flex space-x-2">
                        {plan.status !== 'ACTIVE' && (
                          <button
                            onClick={() => handleUpdateStatus(plan, 'ACTIVE')}
                            className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                          >
                            Activate
                          </button>
                        )}
                        {plan.status !== 'INACTIVE' && (
                          <button
                            onClick={() => handleUpdateStatus(plan, 'INACTIVE')}
                            className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                          >
                            Deactivate
                          </button>
                        )}
                        {plan.status !== 'DRAFT' && (
                          <button
                            onClick={() => handleUpdateStatus(plan, 'DRAFT')}
                            className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
                          >
                            Draft
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
              <div className="bg-white rounded-lg p-6 w-full max-w-md my-8">
                <h2 className="text-xl font-bold mb-4">
                  {editingPlan ? 'Edit Challenge Plan' : 'Create Challenge Plan'}
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
                      Account Size
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.accountSize}
                      onChange={(e) => setFormData({ ...formData, accountSize: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Price
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Currency
                    </label>
                    <input
                      type="text"
                      value={formData.currency}
                      onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="USD"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Rule Set
                    </label>
                    <select
                      value={formData.ruleSetId}
                      onChange={(e) => setFormData({ ...formData, ruleSetId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      required
                    >
                      <option value="">-- Select a rule set --</option>
                      {ruleSets.map((rs) => (
                        <option key={rs.id} value={rs.id}>
                          {rs.name} ({rs.ruleSetRules.length} rules)
                        </option>
                      ))}
                    </select>
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
                      {editingPlan ? 'Update' : 'Create'}
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
