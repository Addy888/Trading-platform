'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export function LandingHeader() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-[#070908]/90 backdrop-blur-xl border-b border-white/10'
          : 'bg-transparent'
      }`}
    >
      <nav className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo/Brand */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-[#B8FF85] to-[#6ee7b7] rounded-lg flex items-center justify-center">
                <span className="text-[#070908] font-bold text-lg">T</span>
              </div>
              <span className="text-[#F5F7F4] font-semibold text-lg hidden sm:inline">
                Trading
              </span>
            </Link>
          </div>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-8">
            <Link
              href="#markets"
              className="text-[#999F99] hover:text-[#F5F7F4] transition-colors text-sm font-medium"
            >
              Markets
            </Link>
            <Link
              href="#trade"
              className="text-[#999F99] hover:text-[#F5F7F4] transition-colors text-sm font-medium"
            >
              Trade
            </Link>
            <Link
              href="#features"
              className="text-[#999F99] hover:text-[#F5F7F4] transition-colors text-sm font-medium"
            >
              Features
            </Link>
            <Link
              href="#how-it-works"
              className="text-[#999F99] hover:text-[#F5F7F4] transition-colors text-sm font-medium"
            >
              Learn
            </Link>
          </div>

          {/* CTA Buttons */}
          <div className="flex items-center space-x-3">
            <Link
              href="/register"
              className="hidden sm:inline-block px-4 py-2 text-[#F5F7F4] text-sm font-medium hover:text-[#B8FF85] transition-colors"
            >
              Sign Up
            </Link>
            <Link
              href="/login"
              className="px-6 py-2.5 bg-[#B8FF85] text-[#070908] rounded-lg text-sm font-semibold hover:bg-[#a8ef75] transition-all hover:shadow-lg hover:shadow-[#B8FF85]/30"
            >
              Start Trading
            </Link>
          </div>
        </div>
      </nav>
    </header>
  );
}
