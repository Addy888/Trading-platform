'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { UserLayout } from '@/components/layout/user-layout';
import { useAuth } from '@/lib/auth-context';
import { tradingAccountsApi } from '@/lib/trading-accounts-api';

export default function ProfilePage() {
  const router = useRouter();
  const { user, accessToken } = useAuth();
  const [accountStats, setAccountStats] = useState({
    total: 0,
    active: 0,
    passed: 0,
    breached: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAccountStats();
  }, [accessToken]);

  const loadAccountStats = async () => {
    if (!accessToken) return;
    
    try {
      const accounts = await tradingAccountsApi.getUserAccounts(accessToken);
      setAccountStats({
        total: accounts.length,
        active: accounts.filter((a: any) => a.status === 'ACTIVE').length,
        passed: accounts.filter((a: any) => a.status === 'PASSED').length,
        breached: accounts.filter((a: any) => a.status === 'BREACHED').length,
      });
    } catch (err) {
      console.error('Failed to load account stats:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute requireRole="USER">
      <UserLayout>
        <div className="max-w-4xl">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
            <Link
              href="/dashboard/settings/profile"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Edit Profile
            </Link>
          </div>

          {/* Profile Information */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-600">Full Name</label>
                <div className="font-semibold text-gray-900">
                  {user?.firstName} {user?.lastName}
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Email Address</label>
                <div className="font-semibold text-gray-900">{user?.email}</div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Phone Number</label>
                <div className="font-semibold text-gray-900">{user?.phone || 'Not provided'}</div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Country</label>
                <div className="font-semibold text-gray-900">{user?.country || 'Not provided'}</div>
              </div>
            </div>
          </div>

          {/* Account Status */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-600">User Role</label>
                <div>
                  <span className={`inline-block px-3 py-1 text-sm font-semibold rounded-full ${
                    user?.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {user?.role}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Account Status</label>
                <div>
                  <span className={`inline-block px-3 py-1 text-sm font-semibold rounded-full ${
                    user?.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {user?.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Email Verification</label>
                <div>
                  <span className={`inline-block px-3 py-1 text-sm font-semibold rounded-full ${
                    user?.isEmailVerified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {user?.isEmailVerified ? 'Verified' : 'Not Verified'}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Member Since</label>
                <div className="font-semibold text-gray-900">
                  {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                </div>
              </div>
            </div>
          </div>

          {/* Trading Accounts Overview */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Trading Accounts Overview</h2>
              <Link
                href="/dashboard/accounts"
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                View All Accounts →
              </Link>
            </div>
            {loading ? (
              <div className="text-center py-4 text-gray-600">Loading...</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-gray-900">{accountStats.total}</div>
                  <div className="text-sm text-gray-600 mt-1">Total Accounts</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-green-600">{accountStats.active}</div>
                  <div className="text-sm text-gray-600 mt-1">Active</div>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-blue-600">{accountStats.passed}</div>
                  <div className="text-sm text-gray-600 mt-1">Passed</div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-red-600">{accountStats.breached}</div>
                  <div className="text-sm text-gray-600 mt-1">Breached</div>
                </div>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link
                href="/dashboard/settings/profile"
                className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition"
              >
                <div className="text-2xl mb-2">👤</div>
                <div className="font-semibold text-gray-900">Edit Profile</div>
                <div className="text-sm text-gray-600 mt-1">Update your information</div>
              </Link>
              <Link
                href="/dashboard/settings/security"
                className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition"
              >
                <div className="text-2xl mb-2">🔒</div>
                <div className="font-semibold text-gray-900">Security</div>
                <div className="text-sm text-gray-600 mt-1">Change password</div>
              </Link>
              <Link
                href="/dashboard/settings/notifications"
                className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition"
              >
                <div className="text-2xl mb-2">🔔</div>
                <div className="font-semibold text-gray-900">Notifications</div>
                <div className="text-sm text-gray-600 mt-1">Manage preferences</div>
              </Link>
            </div>
          </div>
        </div>
      </UserLayout>
    </ProtectedRoute>
  );
}
