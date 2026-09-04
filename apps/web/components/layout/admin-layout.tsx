'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const navigation = [
    { name: 'Dashboard', href: '/admin', icon: '📊' },
    { name: 'Users', href: '/admin/users', icon: '👥' },
    { name: 'Challenge Plans', href: '/admin/challenge-plans', icon: '🎯' },
    { name: 'Trading Rules', href: '/admin/trading-rules', icon: '📋' },
    { name: 'Rule Sets', href: '/admin/rule-sets', icon: '📑' },
    { name: 'Orders', href: '/admin/orders', icon: '📦' },
    { name: 'Trading Accounts', href: '/admin/trading-accounts', icon: '💼' },
    { name: 'Payments', href: '#', icon: '💳', comingSoon: true },
    { name: 'Payouts', href: '#', icon: '💰', comingSoon: true },
    { name: 'KYC', href: '#', icon: '✅', comingSoon: true },
    { name: 'Analytics', href: '#', icon: '📈', comingSoon: true },
    { name: 'Notifications', href: '#', icon: '🔔', comingSoon: true },
    { name: 'Settings', href: '/admin/settings', icon: '⚙️' },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 w-64 bg-gray-900 text-white">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-center h-16 border-b border-gray-800">
            <h1 className="text-xl font-bold">Trading Platform</h1>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-4">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.comingSoon ? '#' : item.href}
                className={`flex items-center px-6 py-3 text-sm ${
                  pathname === item.href
                    ? 'bg-gray-800 text-white border-l-4 border-blue-500'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                } ${item.comingSoon ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={(e) => item.comingSoon && e.preventDefault()}
              >
                <span className="mr-3">{item.icon}</span>
                <span>{item.name}</span>
                {item.comingSoon && (
                  <span className="ml-auto text-xs text-gray-500">Soon</span>
                )}
              </Link>
            ))}
          </nav>

          {/* Admin Info */}
          <div className="border-t border-gray-800 p-4">
            <div className="text-xs text-gray-400">Logged in as</div>
            <div className="text-sm font-medium">{user?.firstName} {user?.lastName}</div>
            <div className="text-xs text-gray-400">{user?.email}</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="ml-64">
        {/* Top Navigation */}
        <div className="bg-white shadow-sm h-16 flex items-center justify-between px-8">
          <div className="text-lg font-semibold text-gray-800">Admin Panel</div>
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center space-x-3 text-sm"
            >
              <div className="text-right">
                <div className="font-medium text-gray-700">{user?.firstName} {user?.lastName}</div>
                <div className="text-xs text-gray-500">Administrator</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </div>
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-10">
                <button
                  onClick={handleLogout}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Page Content */}
        <div className="p-8">{children}</div>
      </div>
    </div>
  );
}
