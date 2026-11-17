'use client';

import { Target, BarChart3, Trophy } from 'lucide-react';

const steps = [
  {
    number: '01',
    icon: Target,
    title: 'Choose Your Challenge',
    description: 'Select the account size and challenge type that fits your trading style and experience level.',
  },
  {
    number: '02',
    icon: BarChart3,
    title: 'Demonstrate Your Skills',
    description: 'Trade live markets, follow the rules, and show us your trading strategy in action.',
  },
  {
    number: '03',
    icon: Trophy,
    title: 'Qualify for Funded Trading',
    description: 'Pass the challenge to unlock your funded account and start trading with real capital.',
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="relative py-24 bg-gradient-to-b from-[#0A0A0F] via-black to-[#0A0A0F]">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-20">
          <h2 className="text-4xl sm:text-5xl font-black text-white mb-4">
            How It <span className="text-[#00A3FF]">Works</span>
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Three simple steps to become a funded trader
          </p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
          {/* Connecting Line (Desktop) */}
          <div className="hidden md:block absolute top-20 left-1/4 right-1/4 h-[2px] bg-gradient-to-r from-[#00A3FF]/50 via-[#00A3FF] to-[#00A3FF]/50" />

          {steps.map((step, index) => (
            <div key={index} className="relative">
              {/* Step Card */}
              <div className="relative z-10 text-center">
                {/* Number Badge */}
                <div className="inline-flex items-center justify-center w-20 h-20 mb-6 bg-gradient-to-br from-[#00A3FF] to-[#0080CC] rounded-2xl shadow-lg shadow-[#00A3FF]/30">
                  <span className="text-3xl font-black text-white">{step.number}</span>
                </div>

                {/* Icon Circle */}
                <div className="flex justify-center mb-6">
                  <div className="w-16 h-16 bg-white/5 backdrop-blur-sm border border-white/10 rounded-full flex items-center justify-center">
                    <step.icon className="w-8 h-8 text-[#00A3FF]" />
                  </div>
                </div>

                {/* Content */}
                <h3 className="text-2xl font-bold text-white mb-4">{step.title}</h3>
                <p className="text-gray-400 leading-relaxed">{step.description}</p>
              </div>

              {/* Arrow (Mobile) */}
              {index < steps.length - 1 && (
                <div className="md:hidden flex justify-center my-8">
                  <div className="w-[2px] h-12 bg-gradient-to-b from-[#00A3FF] to-transparent" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-20 text-center">
          <a
            href="#challenges"
            className="inline-block px-8 py-4 bg-gradient-to-r from-[#00A3FF] to-[#0080CC] text-white rounded-lg text-lg font-semibold hover:shadow-lg hover:shadow-[#00A3FF]/40 transition-all hover:scale-105"
          >
            Start Your Journey
          </a>
        </div>
      </div>
    </section>
  );
}
