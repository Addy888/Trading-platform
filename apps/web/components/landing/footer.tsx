'use client';

import Link from 'next/link';

export function LandingFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#0a0d0a] border-t border-white/10 py-12 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-[#B8FF85] to-[#6ee7b7] rounded-lg flex items-center justify-center">
                <span className="text-[#070908] font-bold text-lg">T</span>
              </div>
              <span className="text-[#F5F7F4] font-semibold text-lg">Trading</span>
            </div>
            <p className="text-[#999F99] text-sm">
              Professional trading platform for modern markets.
            </p>
          </div>

          {/* Platform */}
          <div>
            <h3 className="text-[#F5F7F4] font-semibold mb-4">Platform</h3>
            <ul className="space-y-2">
              <li>
                <a href="#markets" className="text-[#999F99] text-sm hover:text-[#B8FF85] transition-colors">
                  Markets
                </a>
              </li>
              <li>
                <a href="#features" className="text-[#999F99] text-sm hover:text-[#B8FF85] transition-colors">
                  Features
                </a>
              </li>
              <li>
                <Link href="/dashboard/challenges" className="text-[#999F99] text-sm hover:text-[#B8FF85] transition-colors">
                  Challenges
                </Link>
              </li>
            </ul>
          </div>

          {/* Account */}
          <div>
            <h3 className="text-[#F5F7F4] font-semibold mb-4">Account</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/register" className="text-[#999F99] text-sm hover:text-[#B8FF85] transition-colors">
                  Sign Up
                </Link>
              </li>
              <li>
                <Link href="/login" className="text-[#999F99] text-sm hover:text-[#B8FF85] transition-colors">
                  Sign In
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="text-[#999F99] text-sm hover:text-[#B8FF85] transition-colors">
                  Dashboard
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="text-[#F5F7F4] font-semibold mb-4">Support</h3>
            <ul className="space-y-2">
              <li>
                <a href="#how-it-works" className="text-[#999F99] text-sm hover:text-[#B8FF85] transition-colors">
                  How It Works
                </a>
              </li>
              <li>
                <Link href="/dashboard/profile" className="text-[#999F99] text-sm hover:text-[#B8FF85] transition-colors">
                  Profile
                </Link>
              </li>
              <li>
                <Link href="/dashboard/settings/notifications" className="text-[#999F99] text-sm hover:text-[#B8FF85] transition-colors">
                  Settings
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[#999F99] text-sm">
            © {currentYear} Trading Platform. All rights reserved.
          </p>
          <div className="flex items-center space-x-6">
            <a href="#" className="text-[#999F99] text-sm hover:text-[#B8FF85] transition-colors">
              Privacy Policy
            </a>
            <a href="#" className="text-[#999F99] text-sm hover:text-[#B8FF85] transition-colors">
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
