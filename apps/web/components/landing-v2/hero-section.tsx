'use client';

import Link from 'next/link';
import { TrendingUp, BarChart3, Target } from 'lucide-react';

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-b from-black via-[#0A0A0F] to-black">
      {/* Animated Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_80%)]" />
      
      {/* Gradient Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#00A3FF]/20 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#0080CC]/20 rounded-full blur-[120px] animate-pulse delay-1000" />

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 mb-8 bg-white/5 backdrop-blur-sm border border-white/10 rounded-full">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00A3FF] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00A3FF]"></span>
          </span>
          <span className="text-sm text-gray-300 font-medium">
            Trusted by traders worldwide
          </span>
        </div>

        {/* Main Headline */}
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black text-white mb-6 leading-tight tracking-tight">
          TRADE BIGGER.<br />
          THINK SMARTER.<br />
          <span className="bg-gradient-to-r from-[#00A3FF] to-[#00C9FF] bg-clip-text text-transparent">
            GET FUNDED.
          </span>
        </h1>

        {/* Supporting Text */}
        <p className="text-xl text-gray-400 max-w-3xl mx-auto mb-12 leading-relaxed">
          Prove your trading skills, access funded trading opportunities, and grow with{' '}
          <span className="text-white font-semibold">ASSETS FUNDED</span>
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <Link
            href="#challenges"
            className="group relative px-8 py-4 bg-gradient-to-r from-[#00A3FF] to-[#0080CC] text-white rounded-lg text-lg font-semibold overflow-hidden transition-all hover:scale-105 active:scale-95 hover:shadow-2xl hover:shadow-[#00A3FF]/40"
          >
            <span className="relative z-10">Explore Challenges</span>
            <div className="absolute inset-0 bg-gradient-to-r from-[#0080CC] to-[#00A3FF] opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
          <Link
            href="#how-it-works"
            className="px-8 py-4 bg-white/5 backdrop-blur-sm border border-white/20 text-white rounded-lg text-lg font-semibold hover:bg-white/10 transition-all"
          >
            Learn More
          </Link>
        </div>

        {/* Feature Pills */}
        <div className="flex flex-wrap items-center justify-center gap-6">
          <div className="flex items-center gap-2 px-4 py-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-full">
            <TrendingUp className="w-5 h-5 text-[#00A3FF]" />
            <span className="text-sm text-gray-300 font-medium">Live Trading</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-full">
            <BarChart3 className="w-5 h-5 text-[#00A3FF]" />
            <span className="text-sm text-gray-300 font-medium">Real-Time Analytics</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-full">
            <Target className="w-5 h-5 text-[#00A3FF]" />
            <span className="text-sm text-gray-300 font-medium">Risk Management</span>
          </div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
        <div className="flex flex-col items-center gap-2 animate-bounce">
          <span className="text-xs text-gray-500 uppercase tracking-wider">Scroll</span>
          <div className="w-[1px] h-12 bg-gradient-to-b from-gray-500 to-transparent" />
        </div>
      </div>
    </section>
  );
}
