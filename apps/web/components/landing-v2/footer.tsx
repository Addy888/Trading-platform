'use client';

import Link from 'next/link';

export function AssetsFundedFooter() {
  return (
    <footer className="relative bg-black border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          {/* Brand Column */}
          <div className="col-span-1 md:col-span-2">
            <Link href="/" className="inline-block mb-6">
              <div className="relative h-10 w-40 sm:w-44">
                {/* Using inline SVG until PNG is provided */}
                <svg
                  viewBox="0 0 900 600"
                  className="w-full h-full object-contain object-left"
                  style={{ maxHeight: '40px' }}
                >
                  <rect width="900" height="600" fill="#000000"/>
                  
                  {/* AF Logo Symbol */}
                  <g transform="translate(250, 120)">
                    {/* White A shape */}
                    <path d="M 80 180 L 120 60 L 160 180" stroke="#FFFFFF" strokeWidth="18" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="90" y1="140" x2="150" y2="140" stroke="#FFFFFF" strokeWidth="18" strokeLinecap="round"/>
                    
                    {/* Blue accent in A */}
                    <path d="M 95 155 L 120 85 L 145 155" stroke="#00A3FF" strokeWidth="12" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    
                    {/* White F shape */}
                    <line x1="200" y1="60" x2="200" y2="180" stroke="#FFFFFF" strokeWidth="18" strokeLinecap="round"/>
                    <line x1="200" y1="60" x2="270" y2="60" stroke="#FFFFFF" strokeWidth="18" strokeLinecap="round"/>
                    <path d="M 200 60 Q 210 70, 220 80 L 250 85" stroke="#00A3FF" strokeWidth="14" fill="none" strokeLinecap="round"/>
                    <line x1="200" y1="120" x2="250" y2="120" stroke="#FFFFFF" strokeWidth="18" strokeLinecap="round"/>
                  </g>
                  
                  {/* ASSETS text */}
                  <text x="220" y="380" fontFamily="Arial, sans-serif" fontSize="80" fontWeight="bold" fill="#FFFFFF" letterSpacing="8">ASSETS</text>
                  
                  {/* FUNDED text */}
                  <text x="250" y="470" fontFamily="Arial, sans-serif" fontSize="72" fontWeight="bold" fill="#00A3FF" letterSpacing="16">FUNDED</text>
                  
                  {/* Decorative lines */}
                  <line x1="140" y1="490" x2="220" y2="490" stroke="#00A3FF" strokeWidth="3"/>
                  <line x1="680" y1="490" x2="760" y2="490" stroke="#00A3FF" strokeWidth="3"/>
                </svg>
              </div>
            </Link>
            <p className="text-gray-400 max-w-md mb-6">
              Empowering traders worldwide with access to funded trading opportunities. Trade bigger, think smarter, get funded.
            </p>
            <div className="flex items-center gap-4">
              {/* Social Icons Placeholder */}
              <a href="#" className="w-10 h-10 bg-white/5 hover:bg-[#00A3FF]/20 border border-white/10 hover:border-[#00A3FF]/50 rounded-lg flex items-center justify-center transition-all">
                <span className="text-gray-400 hover:text-[#00A3FF] text-sm">𝕏</span>
              </a>
              <a href="#" className="w-10 h-10 bg-white/5 hover:bg-[#00A3FF]/20 border border-white/10 hover:border-[#00A3FF]/50 rounded-lg flex items-center justify-center transition-all">
                <span className="text-gray-400 hover:text-[#00A3FF] text-sm">in</span>
              </a>
              <a href="#" className="w-10 h-10 bg-white/5 hover:bg-[#00A3FF]/20 border border-white/10 hover:border-[#00A3FF]/50 rounded-lg flex items-center justify-center transition-all">
                <span className="text-gray-400 hover:text-[#00A3FF] text-sm">📱</span>
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white font-semibold mb-4">Platform</h3>
            <ul className="space-y-3">
              <li>
                <Link href="#challenges" className="text-gray-400 hover:text-[#00A3FF] transition-colors">
                  Challenges
                </Link>
              </li>
              <li>
                <Link href="#how-it-works" className="text-gray-400 hover:text-[#00A3FF] transition-colors">
                  How It Works
                </Link>
              </li>
              <li>
                <Link href="#rules" className="text-gray-400 hover:text-[#00A3FF] transition-colors">
                  Trading Rules
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="text-gray-400 hover:text-[#00A3FF] transition-colors">
                  Dashboard
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="text-white font-semibold mb-4">Support</h3>
            <ul className="space-y-3">
              <li>
                <Link href="#faq" className="text-gray-400 hover:text-[#00A3FF] transition-colors">
                  FAQ
                </Link>
              </li>
              <li>
                <a href="mailto:support@assetsfunded.com" className="text-gray-400 hover:text-[#00A3FF] transition-colors">
                  Contact
                </a>
              </li>
              <li>
                <Link href="/terms" className="text-gray-400 hover:text-[#00A3FF] transition-colors">
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-gray-400 hover:text-[#00A3FF] transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/risk-disclosure" className="text-gray-400 hover:text-[#00A3FF] transition-colors">
                  Risk Disclosure
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-gray-500 text-sm">
            © {new Date().getFullYear()} ASSETS FUNDED. All rights reserved.
          </p>
          <p className="text-gray-500 text-sm">
            Trading involves risk. Past performance does not guarantee future results.
          </p>
        </div>
      </div>
    </footer>
  );
}
