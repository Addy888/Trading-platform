'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

export function AssetsFundedNavbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        isScrolled
          ? 'bg-black/95 backdrop-blur-xl border-b border-white/10 shadow-2xl'
          : 'bg-transparent'
      }`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center group">
            <div className="relative h-12 w-44 sm:w-52 lg:w-56">
              {/* Using inline SVG until PNG is provided */}
              <svg
                viewBox="0 0 900 600"
                className="w-full h-full object-contain object-left transition-transform duration-300 group-hover:scale-105"
                style={{ maxHeight: '48px' }}
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

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <Link
              href="#challenges"
              className="text-gray-300 hover:text-white transition-colors text-sm font-medium"
            >
              Challenges
            </Link>
            <Link
              href="#how-it-works"
              className="text-gray-300 hover:text-white transition-colors text-sm font-medium"
            >
              How It Works
            </Link>
            <Link
              href="#rules"
              className="text-gray-300 hover:text-white transition-colors text-sm font-medium"
            >
              Trading Rules
            </Link>
            <Link
              href="#faq"
              className="text-gray-300 hover:text-white transition-colors text-sm font-medium"
            >
              FAQ
            </Link>
          </div>

          {/* CTA Buttons */}
          <div className="hidden md:flex items-center space-x-4">
            <Link
              href="/login"
              className="px-5 py-2.5 text-white text-sm font-medium hover:text-[#00A3FF] transition-colors"
            >
              Login
            </Link>
            <Link
              href="#challenges"
              className="px-6 py-2.5 bg-gradient-to-r from-[#00A3FF] to-[#0080CC] text-white rounded-lg text-sm font-semibold hover:shadow-lg hover:shadow-[#00A3FF]/30 transition-all hover:scale-105 active:scale-95"
            >
              Get Funded
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-gray-300 hover:text-white transition-colors"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 space-y-3 border-t border-white/10">
            <Link
              href="#challenges"
              className="block px-4 py-2 text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Challenges
            </Link>
            <Link
              href="#how-it-works"
              className="block px-4 py-2 text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              How It Works
            </Link>
            <Link
              href="#rules"
              className="block px-4 py-2 text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Trading Rules
            </Link>
            <Link
              href="#faq"
              className="block px-4 py-2 text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              FAQ
            </Link>
            <div className="pt-4 space-y-2 border-t border-white/10">
              <Link
                href="/login"
                className="block px-4 py-2 text-center text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Login
              </Link>
              <Link
                href="#challenges"
                className="block px-4 py-2 text-center bg-gradient-to-r from-[#00A3FF] to-[#0080CC] text-white rounded-lg font-semibold"
                onClick={() => setMobileMenuOpen(false)}
              >
                Get Funded
              </Link>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
