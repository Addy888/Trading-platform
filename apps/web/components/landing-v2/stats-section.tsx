'use client';

import { TrendingUp, Users, Globe, DollarSign } from 'lucide-react';

const stats = [
  {
    icon: Users,
    value: '10,000+',
    label: 'Active Traders',
    description: 'Traders worldwide',
  },
  {
    icon: DollarSign,
    value: '$5M+',
    label: 'Platform AUM',
    description: 'Assets under management',
  },
  {
    icon: Globe,
    value: '150+',
    label: 'Countries',
    description: 'Global reach',
  },
  {
    icon: TrendingUp,
    value: '85%',
    label: 'Success Rate',
    description: 'Funded traders',
  },
];

export function StatsSection() {
  return (
    <section className="relative py-24 bg-gradient-to-b from-black via-[#0A0A0F] to-black">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-black text-white mb-4">
            Trusted by <span className="text-[#00A3FF]">Traders</span> Worldwide
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Join thousands of successful traders growing their capital
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="relative group p-8 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl hover:border-[#00A3FF]/50 transition-all duration-300"
            >
              {/* Glow Effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#00A3FF]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
              
              {/* Icon */}
              <div className="relative mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-[#00A3FF]/20 to-[#0080CC]/20 rounded-xl flex items-center justify-center border border-[#00A3FF]/30">
                  <stat.icon className="w-6 h-6 text-[#00A3FF]" />
                </div>
              </div>

              {/* Value */}
              <div className="relative text-4xl font-black text-white mb-2">{stat.value}</div>
              
              {/* Label */}
              <div className="relative text-lg font-semibold text-gray-300 mb-1">{stat.label}</div>
              
              {/* Description */}
              <div className="relative text-sm text-gray-500">{stat.description}</div>
            </div>
          ))}
        </div>

        {/* Note */}
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500">
            Platform statistics are for demonstration purposes. Actual performance may vary.
          </p>
        </div>
      </div>
    </section>
  );
}
