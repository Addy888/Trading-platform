'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { useRouter } from 'next/navigation';
import { challengePlansApi, ChallengePlan } from '@/lib/challenge-plans-api';

export default function ChallengesPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<ChallengePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const data = await challengePlansApi.getAllPublic();
      setPlans(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load challenge plans');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (planId: string) => {
    router.push(`/dashboard/challenges/${planId}`);
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-100">
        {/* Header */}
        <div className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <h1 className="text-3xl font-bold text-gray-900">Trading Challenges</h1>
            <p className="mt-2 text-gray-600">
              Choose your challenge and prove your trading skills
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="text-center py-12 text-gray-600">Loading challenges...</div>
          ) : plans.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <p className="text-gray-600 text-lg">No challenges available at the moment</p>
              <p className="text-gray-500 mt-2">Check back soon for new opportunities!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className="bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow"
                >
                  <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6 text-white">
                    <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                    <div className="text-3xl font-bold">
                      {plan.currency} {parseFloat(plan.accountSize).toLocaleString()}
                    </div>
                    <p className="text-blue-100 text-sm mt-1">Account Size</p>
                  </div>

                  <div className="p-6">
                    {plan.description && (
                      <p className="text-gray-600 mb-4">{plan.description}</p>
                    )}

                    <div className="mb-6">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-medium text-gray-700">Trading Rules</span>
                      </div>
                      <div className="space-y-2">
                        {plan.ruleSet.ruleSetRules.map((rsr) => (
                          <div
                            key={rsr.id}
                            className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded"
                          >
                            <span className="text-sm text-gray-700">{rsr.rule.name}</span>
                            <span className="text-sm font-semibold text-gray-900">
                              {rsr.rule.value}{rsr.rule.isPercentage ? '%' : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border-t pt-4 mb-4">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Challenge Price</span>
                        <span className="text-2xl font-bold text-green-600">
                          {plan.currency} {parseFloat(plan.price).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleViewDetails(plan.id)}
                      className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 font-semibold transition-colors"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
