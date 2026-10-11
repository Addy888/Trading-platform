'use client';

import Link from 'next/link';

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
      {/* Ambient background lighting */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px] animate-pulse delay-1000"></div>
      </div>

      <div className="relative max-w-7xl mx-auto px-6 py-20 grid lg:grid-cols-2 gap-12 items-center">
        {/* Left Column - Content */}
        <div className="space-y-8 animate-fade-in-up">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-[#F5F7F4] leading-tight">
            Precision Trading
            <br />
            <span className="bg-gradient-to-r from-[#B8FF85] via-[#6ee7b7] to-[#06b6d4] bg-clip-text text-transparent">
              for Modern Markets
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-[#999F99] max-w-xl leading-relaxed">
            Explore market opportunities, analyze price movements, and manage your
            trading activity in one intuitive workspace.
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href="/register"
              className="group px-8 py-4 bg-[#B8FF85] text-[#070908] rounded-lg text-base font-semibold hover:bg-[#a8ef75] transition-all hover:shadow-xl hover:shadow-[#B8FF85]/30 hover:scale-105 text-center"
            >
              Start Trading
              <span className="inline-block ml-2 group-hover:translate-x-1 transition-transform">
                →
              </span>
            </Link>
            <a
              href="#markets"
              className="px-8 py-4 bg-transparent border border-[#999F99]/30 text-[#F5F7F4] rounded-lg text-base font-semibold hover:border-[#B8FF85]/50 hover:bg-[#B8FF85]/5 transition-all text-center"
            >
              View Markets
            </a>
          </div>

          {/* Trust indicators */}
          <div className="flex items-center gap-8 pt-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-[#F5F7F4]">Real-time</div>
              <div className="text-sm text-[#999F99]">Market Data</div>
            </div>
            <div className="w-px h-12 bg-[#999F99]/20"></div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[#F5F7F4]">Advanced</div>
              <div className="text-sm text-[#999F99]">Analytics</div>
            </div>
            <div className="w-px h-12 bg-[#999F99]/20"></div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[#F5F7F4]">Secure</div>
              <div className="text-sm text-[#999F99]">Platform</div>
            </div>
          </div>
        </div>

        {/* Right Column - Futuristic Visual */}
        <div className="relative hidden lg:block animate-fade-in">
          <div className="relative w-full h-[600px] flex items-center justify-center">
            {/* Glass morphism shape */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-80 h-80 animate-float">
                {/* Main glass sphere */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#B8FF85]/20 via-cyan-500/20 to-violet-500/20 blur-2xl"></div>
                
                {/* Glass layers */}
                <div className="absolute inset-8 rounded-full glass-effect border-2 border-white/10">
                  <div className="absolute inset-4 rounded-full bg-gradient-to-br from-emerald-500/30 to-cyan-500/30 blur-xl"></div>
                </div>

                {/* Inner glow */}
                <div className="absolute inset-16 rounded-full bg-gradient-to-br from-[#B8FF85]/40 to-violet-500/40 blur-2xl animate-pulse"></div>

                {/* Accent rings */}
                <div className="absolute inset-0 rounded-full border border-[#B8FF85]/30 animate-spin" style={{ animationDuration: '20s' }}></div>
                <div className="absolute inset-12 rounded-full border border-cyan-500/20 animate-spin" style={{ animationDuration: '15s', animationDirection: 'reverse' }}></div>
              </div>

              {/* Floating particles */}
              <div className="absolute top-20 right-10 w-3 h-3 bg-[#B8FF85] rounded-full blur-sm animate-pulse"></div>
              <div className="absolute bottom-32 left-16 w-2 h-2 bg-cyan-400 rounded-full blur-sm animate-pulse" style={{ animationDelay: '0.5s' }}></div>
              <div className="absolute top-40 left-20 w-2 h-2 bg-violet-400 rounded-full blur-sm animate-pulse" style={{ animationDelay: '1s' }}></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
