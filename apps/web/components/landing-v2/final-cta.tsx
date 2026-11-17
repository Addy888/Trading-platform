'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export function FinalCTA() {
  return (
    <section className="relative py-32 bg-gradient-to-b from-black via-[#0A0A0F] to-black overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#00A3FF]/10 rounded-full blur-[150px]" />

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Headline */}
        <h2 className="text-5xl sm:text-6xl font-black text-white mb-6 leading-tight">
          YOUR TRADING JOURNEY<br />
          <span className="bg-gradient-to-r from-[#00A3FF] to-[#00C9FF] bg-clip-text text-transparent">
            STARTS HERE.
          </span>
        </h2>

        {/* Supporting Text */}
        <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto">
          Join thousands of traders who have turned their skills into funded opportunities. Start your challenge today.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="#challenges"
            className="group relative px-10 py-5 bg-gradient-to-r from-[#00A3FF] to-[#0080CC] text-white rounded-lg text-lg font-bold overflow-hidden transition-all hover:scale-105 active:scale-95 hover:shadow-2xl hover:shadow-[#00A3FF]/50"
          >
            <span className="relative z-10 flex items-center gap-2">
              Explore Challenges
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-[#0080CC] to-[#00A3FF] opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
          
          <Link
            href="/register"
            className="px-10 py-5 bg-white/5 backdrop-blur-sm border-2 border-white/20 text-white rounded-lg text-lg font-bold hover:bg-white/10 hover:border-[#00A3FF]/50 transition-all"
          >
            Create Account
          </Link>
        </div>

        {/* Trust Indicators */}
        <div className="mt-16 pt-12 border-t border-white/10 flex flex-wrap items-center justify-center gap-8">
          <div className="text-center">
            <div className="text-3xl font-black text-white mb-1">10,000+</div>
            <div className="text-sm text-gray-500">Active Traders</div>
          </div>
          <div className="w-[1px] h-12 bg-white/10" />
          <div className="text-center">
            <div className="text-3xl font-black text-white mb-1">150+</div>
            <div className="text-sm text-gray-500">Countries</div>
          </div>
          <div className="w-[1px] h-12 bg-white/10" />
          <div className="text-center">
            <div className="text-3xl font-black text-white mb-1">24/7</div>
            <div className="text-sm text-gray-500">Support</div>
          </div>
        </div>
      </div>
    </section>
  );
}
