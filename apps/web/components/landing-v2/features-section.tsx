'use client';

import { Target, Shield, TrendingUp, Users, Award, Headphones } from 'lucide-react';

const features = [
  {
    icon: Target,
    title: 'Multiple Challenge Options',
    description: 'Choose from various account sizes and challenge types that match your trading style and experience.',
  },
  {
    icon: Shield,
    title: 'Transparent Trading Rules',
    description: 'Clear, straightforward rules with no hidden clauses. Know exactly what you need to succeed.',
  },
  {
    icon: TrendingUp,
    title: 'Professional Trading Dashboard',
    description: 'Access advanced charts, real-time data, and professional-grade trading tools.',
  },
  {
    icon: Users,
    title: 'Risk Management',
    description: 'Built-in risk controls and drawdown limits to protect your trading capital.',
  },
  {
    icon: Award,
    title: 'Performance Tracking',
    description: 'Detailed analytics and performance metrics to help you improve your trading.',
  },
  {
    icon: Headphones,
    title: 'Trader Support',
    description: 'Dedicated support team available to assist you throughout your trading journey.',
  },
];

export function FeaturesSection() {
  return (
    <section className="relative py-24 bg-gradient-to-b from-black via-[#0A0A0F] to-black">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px] opacity-30" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-black text-white mb-4">
            Why <span className="text-[#00A3FF]">ASSETS FUNDED</span>?
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Everything you need to succeed as a funded trader
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group relative p-8 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl hover:bg-white/10 hover:border-[#00A3FF]/50 transition-all duration-300 hover:scale-105"
            >
              {/* Glow Effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#00A3FF]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
              
              {/* Icon */}
              <div className="relative mb-6">
                <div className="w-14 h-14 bg-gradient-to-br from-[#00A3FF]/20 to-[#0080CC]/20 rounded-xl flex items-center justify-center border border-[#00A3FF]/30 group-hover:scale-110 transition-transform">
                  <feature.icon className="w-7 h-7 text-[#00A3FF]" />
                </div>
              </div>

              {/* Content */}
              <h3 className="relative text-xl font-bold text-white mb-3">{feature.title}</h3>
              <p className="relative text-gray-400 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
