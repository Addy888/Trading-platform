'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { challengePlansApi, ChallengePlan } from '@/lib/challenge-plans-api';
import { ordersApi } from '@/lib/orders-api';
import { useAuth } from '@/lib/auth-context';

export default function ChallengePlanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { accessToken } = useAuth();
  const planId = params.id as string;
  const [plan, setPlan] = useState<ChallengePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    if (planId) {
      fetchPlan();
    }
  }, [planId]);

  const fetchPlan = async () => {
    try {
      setLoading(true);
      const data = await challengePlansApi.getOne(planId);
      setPlan(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load challenge plan');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!accessToken || !plan) return;

    if (!confirm(`Purchase ${plan.name} for ${plan.currency} ${parseFloat(plan.price).toLocaleString()}?`)) {
      return;
    }

    try {
      setPurchasing(true);
      const order = await ordersApi.create(accessToken, {
        challengePlanId: plan.id,
      });
      
      // Redirect to order detail page
      router.push(`/dashboard/orders/${order.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create order');
      setPurchasing(false);
    }
  };

  const getRuleTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      PROFIT_TARGET: 'Profit Target',
      DAILY_LOSS: 'Daily Loss Limit',
      MAX_DRAWDOWN: 'Maximum Drawdown',
      MIN_TRADING_DAYS: 'Minimum Trading Days',
    };
    return labels[type] || type;
  };

  const getRuleDescription = (type: string) => {
    const descriptions: Record<string, string> = {
      PROFIT_TARGET: 'The profit percentage you need to achieve to pass the challenge',
      DAILY_LOSS: 'Maximum loss allowed in a single trading day',
      MAX_DRAWDOWN: 'Maximum total loss allowed from your highest balance',
      MIN_TRADING_DAYS: 'Minimum number of days you must trade',
    };
    return descriptions[type] || '';
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <div className="text-gray-600">Loading challenge details...</div>
        </div>
      </ProtectedRoute>
    );
  }

  if (error || !plan) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-600 mb-4">{error || 'Challenge not found'}</p>
            <button
              onClick={() => router.push('/dashboard/challenges')}
              className="text-blue-600 hover:text-blue-800"
            >
              Back to Challenges
            </button>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-100">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <button
              onClick={() => router.push('/dashboard/challenges')}
              className="text-blue-100 hover:text-white mb-4 flex items-center"
            >
              ← Back to Challenges
            </button>
            <h1 className="text-4xl font-bold mb-2">{plan.name}</h1>
            {plan.description && (
              <p className="text-blue-100 text-lg">{plan.description}</p>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Details */}
            <div className="lg:col-span-2 space-y-6">
              {/* Challenge Overview */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Challenge Overview</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="text-sm text-blue-600 font-medium mb-1">Account Size</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {plan.currency} {parseFloat(plan.accountSize).toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="text-sm text-green-600 font-medium mb-1">Challenge Price</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {plan.currency} {parseFloat(plan.price).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Trading Rules */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Trading Rules</h2>
                <p className="text-gray-600 mb-6">
                  You must follow these rules to successfully pass the challenge. Breaking any rule will result in challenge failure.
                </p>
                <div className="space-y-4">
                  {plan.ruleSet.ruleSetRules.map((rsr) => (
                    <div key={rsr.id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            {getRuleTypeLabel(rsr.rule.type)}
                          </h3>
                          {rsr.rule.description && (
                            <p className="text-sm text-gray-600 mt-1">{rsr.rule.description}</p>
                          )}
                          {!rsr.rule.description && (
                            <p className="text-sm text-gray-600 mt-1">{getRuleDescription(rsr.rule.type)}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-blue-600">
                            {rsr.rule.value}{rsr.rule.isPercentage ? '%' : ''}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* How It Works */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">How It Works</h2>
                <div className="space-y-4">
                  <div className="flex items-start">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                      1
                    </div>
                    <div className="ml-4">
                      <h3 className="font-semibold text-gray-900">Purchase Challenge</h3>
                      <p className="text-gray-600 text-sm">
                        Complete the purchase to gain access to your trading account
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                      2
                    </div>
                    <div className="ml-4">
                      <h3 className="font-semibold text-gray-900">Trade & Follow Rules</h3>
                      <p className="text-gray-600 text-sm">
                        Execute your trading strategy while adhering to all challenge rules
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                      3
                    </div>
                    <div className="ml-4">
                      <h3 className="font-semibold text-gray-900">Pass & Get Funded</h3>
                      <p className="text-gray-600 text-sm">
                        Meet the profit target and you'll receive a funded trading account
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow p-6 sticky top-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Purchase Challenge</h3>
                
                <div className="border-t border-b border-gray-200 py-4 mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-600">Account Size</span>
                    <span className="font-semibold text-gray-900">
                      {plan.currency} {parseFloat(plan.accountSize).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Challenge Price</span>
                    <span className="font-semibold text-gray-900">
                      {plan.currency} {parseFloat(plan.price).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="text-sm text-gray-600 mb-2">Total Amount</div>
                  <div className="text-3xl font-bold text-gray-900">
                    {plan.currency} {parseFloat(plan.price).toLocaleString()}
                  </div>
                </div>

                <button
                  onClick={handlePurchase}
                  disabled={purchasing}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed mb-2"
                >
                  {purchasing ? 'Processing...' : 'Purchase Challenge'}
                </button>
                <p className="text-xs text-center text-gray-500">
                  Secure payment processing
                </p>

                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h4 className="font-semibold text-gray-900 mb-3">What's Included</h4>
                  <ul className="space-y-2 text-sm text-gray-600">
                    <li className="flex items-start">
                      <span className="text-green-500 mr-2">✓</span>
                      <span>Demo trading account with {plan.currency} {parseFloat(plan.accountSize).toLocaleString()}</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-500 mr-2">✓</span>
                      <span>Real-time market data</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-500 mr-2">✓</span>
                      <span>24/7 platform access</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-500 mr-2">✓</span>
                      <span>Performance tracking</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-500 mr-2">✓</span>
                      <span>Certificate upon completion</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
