'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import {
  LayoutDashboard,
  TrendingUp,
  Wallet,
  Briefcase,
  Target,
  Package,
  Bell,
  DollarSign,
  ShieldCheck,
  User,
  Settings,
  Menu,
  X,
  LogOut,
  ChevronDown,
  Zap,
} from 'lucide-react';

interface UserLayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  group: 'workspace' | 'account';
}

export function UserLayout({ children }: UserLayoutProps) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showProfileMenu && !target.closest('.profile-menu-container')) {
        setShowProfileMenu(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileMenu]);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const navigation: NavItem[] = [
    // WORKSPACE group
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, group: 'workspace' },
    { name: 'Trading', href: '/dashboard/trading', icon: TrendingUp, group: 'workspace' },
    { name: 'Wallet & Deposits', href: '/dashboard/wallet', icon: Wallet, group: 'workspace' },
    { name: 'Trading Accounts', href: '/dashboard/accounts', icon: Briefcase, group: 'workspace' },
    { name: 'Challenges', href: '/dashboard/challenges', icon: Target, group: 'workspace' },
    
    // ACCOUNT group
    { name: 'My Orders', href: '/dashboard/orders', icon: Package, group: 'account' },
    { name: 'Notifications', href: '/dashboard/notifications', icon: Bell, group: 'account' },
    { name: 'Payouts', href: '/dashboard/payouts', icon: DollarSign, group: 'account' },
    { name: 'KYC', href: '/dashboard/kyc', icon: ShieldCheck, group: 'account' },
    { name: 'Profile', href: '/dashboard/profile', icon: User, group: 'account' },
    { name: 'Settings', href: '/dashboard/settings/notifications', icon: Settings, group: 'account' },
  ];

  const workspaceNav = navigation.filter(item => item.group === 'workspace');
  const accountNav = navigation.filter(item => item.group === 'account');

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard';
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0B1020] to-[#0a0d1a] text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-[270px] bg-[#111A2D] border-r border-slate-800/50 fixed inset-y-0 left-0 z-40">
        {/* Brand Header */}
        <div className="h-20 flex items-center px-6 border-b border-slate-800/50">
          <Link href="/dashboard" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#573BFF] to-[#7c5dff] flex items-center justify-center shadow-lg shadow-purple-500/20 group-hover:shadow-purple-500/40 transition-all duration-300">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="font-bold text-lg tracking-tight text-white">
                TRADEING
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="px-2 py-0.5 text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded uppercase tracking-wider">
                  SIMULATED
                </span>
              </div>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
          {/* WORKSPACE Section */}
          <div>
            <div className="px-3 mb-3">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Workspace
              </h3>
            </div>
            <div className="space-y-1">
              {workspaceNav.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`
                      group relative flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200
                      ${active 
                        ? 'bg-[#573BFF] text-white shadow-lg shadow-purple-500/30' 
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                      }
                    `}
                  >
                    {active && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full" />
                    )}
                    <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-white' : 'text-slate-500 group-hover:text-white'} transition-colors`}  />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* ACCOUNT Section */}
          <div>
            <div className="px-3 mb-3">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Account
              </h3>
            </div>
            <div className="space-y-1">
              {accountNav.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`
                      group relative flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200
                      ${active 
                        ? 'bg-[#573BFF] text-white shadow-lg shadow-purple-500/30' 
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                      }
                    `}
                  >
                    {active && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full" />
                    )}
                    <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-white' : 'text-slate-500 group-hover:text-white'} transition-colors`}  />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>

        {/* User Profile Footer */}
        <div className="p-4 border-t border-slate-800/50">
          <div className="profile-menu-container relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-800/50 transition-all duration-200 group"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#573BFF] to-[#7c5dff] flex items-center justify-center text-white font-bold text-sm shadow-md">
                {user?.firstName?.[0]?.toUpperCase() || 'U'}{user?.lastName?.[0]?.toUpperCase() || ''}
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="text-sm font-semibold text-white truncate">
                  {user?.firstName} {user?.lastName}
                </div>
                <div className="text-xs text-slate-400 truncate">
                  {user?.email}
                </div>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showProfileMenu ? 'rotate-180' : ''}`} />
            </button>

            {showProfileMenu && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-[#111A2D] border border-slate-800/50 rounded-xl shadow-2xl py-2 z-50">
                <Link
                  href="/dashboard/profile"
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800/50 hover:text-white transition-colors"
                  onClick={() => setShowProfileMenu(false)}
                >
                  <User className="w-4 h-4" />
                  <span>My Profile</span>
                </Link>
                <Link
                  href="/dashboard/wallet"
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800/50 hover:text-white transition-colors"
                  onClick={() => setShowProfileMenu(false)}
                >
                  <Wallet className="w-4 h-4" />
                  <span>Wallet & Ledger</span>
                </Link>
                <Link
                  href="/dashboard/trading"
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800/50 hover:text-white transition-colors"
                  onClick={() => setShowProfileMenu(false)}
                >
                  <TrendingUp className="w-4 h-4" />
                  <span>Trading Terminal</span>
                </Link>
                <div className="my-1 border-t border-slate-800/50" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 text-left px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:ml-[270px]">
        {/* Top Bar for Mobile */}
        <div className="lg:hidden sticky top-0 z-30 bg-[#111A2D] border-b border-slate-800/50 backdrop-blur-xl">
          <div className="flex items-center justify-between h-16 px-4">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>

            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#573BFF] to-[#7c5dff] flex items-center justify-center shadow-lg">
                <Zap className="w-5 h-5 text-white"  />
              </div>
              <span className="font-bold text-base text-white">TRADEING</span>
            </Link>

            <div className="flex items-center gap-2">
              <NotificationBell />
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#573BFF] to-[#7c5dff] flex items-center justify-center text-white font-bold text-xs">
                {user?.firstName?.[0]?.toUpperCase() || 'U'}
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <>
            <div 
              className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="lg:hidden fixed inset-y-0 left-0 w-[280px] bg-[#111A2D] border-r border-slate-800/50 z-50 overflow-y-auto">
              {/* Mobile Brand */}
              <div className="h-16 flex items-center px-4 border-b border-slate-800/50">
                <Link href="/dashboard" className="flex items-center gap-2.5" onClick={() => setMobileMenuOpen(false)}>
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#573BFF] to-[#7c5dff] flex items-center justify-center shadow-lg">
                    <Zap className="w-5 h-5 text-white"  />
                  </div>
                  <div>
                    <div className="font-bold text-base text-white">TRADEING</div>
                    <div className="px-1.5 py-0.5 text-[8px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded uppercase tracking-wider inline-block">
                      SIMULATED
                    </div>
                  </div>
                </Link>
              </div>

              {/* Mobile Navigation */}
              <nav className="px-4 py-6 space-y-6">
                {/* WORKSPACE Section */}
                <div>
                  <div className="px-3 mb-3">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Workspace
                    </h3>
                  </div>
                  <div className="space-y-1">
                    {workspaceNav.map((item) => {
                      const active = isActive(item.href);
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`
                            group relative flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200
                            ${active 
                              ? 'bg-[#573BFF] text-white shadow-lg shadow-purple-500/30' 
                              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                            }
                          `}
                        >
                          {active && (
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full" />
                          )}
                          <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-white' : 'text-slate-500 group-hover:text-white'} transition-colors`}  />
                          <span>{item.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>

                {/* ACCOUNT Section */}
                <div>
                  <div className="px-3 mb-3">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Account
                    </h3>
                  </div>
                  <div className="space-y-1">
                    {accountNav.map((item) => {
                      const active = isActive(item.href);
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`
                            group relative flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200
                            ${active 
                              ? 'bg-[#573BFF] text-white shadow-lg shadow-purple-500/30' 
                              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                            }
                          `}
                        >
                          {active && (
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full" />
                          )}
                          <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-white' : 'text-slate-500 group-hover:text-white'} transition-colors`}  />
                          <span>{item.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </nav>

              {/* Mobile User Profile */}
              <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-800/50 bg-[#111A2D]">
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-800/30">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#573BFF] to-[#7c5dff] flex items-center justify-center text-white font-bold text-sm shadow-md">
                    {user?.firstName?.[0]?.toUpperCase() || 'U'}{user?.lastName?.[0]?.toUpperCase() || ''}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                      {user?.firstName} {user?.lastName}
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {user?.email}
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                    aria-label="Sign Out"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Page Content */}
        <main className="p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

