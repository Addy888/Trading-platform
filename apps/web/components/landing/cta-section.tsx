'use client';

import Link from 'next/link';

export function CTASection() {
  return (
    <section className="py-20 px-6 relative">
      <div className="max-w-4xl mx-auto">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#101310] via-[#0a0d0a] to-[#101310] border border-[#B8FF85]/30 p-12 text-center">
          {/* Ambient glow */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-0 left-1/4 w-64 h-64 bg-[#B8FF85]/20 rounded-full blur-[100px]"></div>
            <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-cyan-500/20 rounded-full blur-[100px]"></div>
          </div>

          <div className="relative z-10">
            <h2 className="text-4xl sm:text-5xl font-bold text-[#F5F7F4] mb-4">
              Ready to Start Trading?
            </h2>
            <p className="text-lg text-[#999F99] mb-8 max-w-2xl mx-auto">
              Join traders using our platform to access global markets with professional-grade tools
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/register"
                className="group px-8 py-4 bg-[#B8FF85] text-[#070908] rounded-lg text-base font-semibold hover:bg-[#a8ef75] transition-all hover:shadow-xl hover:shadow-[#B8FF85]/30 hover:scale-105"
              >
                Start Trading Now
                <span className="inline-block ml-2 group-hover:translate-x-1 transition-transform">
                  →
                </span>
              </Link>
              <Link
                href="/login"
                className="px-8 py-4 bg-transparent border border-[#999F99]/30 text-[#F5F7F4] rounded-lg text-base font-semibold hover:border-[#B8FF85]/50 hover:bg-[#B8FF85]/5 transition-all"
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
