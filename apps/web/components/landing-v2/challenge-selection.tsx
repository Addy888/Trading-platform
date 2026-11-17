'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';

interface ChallengePlan {
  id: string;
  name: string;
  accountSize: string;
  price: string;
  profitTarget: string;
  dailyDrawdown: string;
  maxDrawdown: string;
  featured?: boolean;
}

export function ChallengeSelection() {
  const [plans, setPlans] = useState<ChallengePlan[]>([
    {
      id: '1',
      name: 'Starter',
      accountSize: '$10,000',
      price: '$99',
      profitTarget: '8%',
      dailyDrawdown: '5%',
      maxDrawdown: '10%',
    },
    {
      id: '2',
      name: 'Professional',
      accountSize: '$50,000',
      price: '$349',
      profitTarget: '8%',
      dailyDrawdown: '5%',
      maxDrawdown: '10%',
      featured: true,
    },
    {
      id: '3',
      name: 'Elite',
      accountSize: '$100,000',
      price: '$599',
      profitTarget: '8%',
      dailyDrawdown: '5%',
      maxDrawdown: '10%',
    },
  ]);

  // TODO: Fetch actual challenge plans from API
  // useEffect(() => {
  //   fetch('/api/challenge-plans')
  //     .then(res => res.json())
  //     .then(data => setPlans(data));
  // }, []);

  return (
    <section id="challenges" className="relative py-24 bg-black">
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0F] via-black to-[#0A0A0F]" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-black text-white mb-4">
            Choose Your <span className="text-[#00A3FF]">Challenge</span>
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Select the account size that fits your trading goals
          </p>
        </div>

        {/* Challenge Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative p-8 rounded-2xl transition-all duration-300 ${
                plan.featured
                  ? 'bg-gradient-to-br from-[#00A3FF]/20 to-[#0080CC]/10 border-2 border-[#00A3FF] scale-105'
                  : 'bg-white/5 border border-white/10 hover:border-[#00A3FF]/50'
              }`}
            >
              {/* Featured Badge */}
              {plan.featured && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-[#00A3FF] to-[#0080CC] text-white text-sm font-bold rounded-full">
                  MOST POPULAR
                </div>
              )}

              {/* Plan Name */}
              <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
              
              {/* Account Size */}
              <div className="mb-6">
                <div className="text-5xl font-black text-[#00A3FF] mb-2">{plan.accountSize}</div>
                <div className="text-gray-400">Account Size</div>
              </div>

              {/* Price */}
              <div className="mb-8 pb-8 border-b border-white/10">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-white">{plan.price}</span>
                  <span className="text-gray-400">one-time</span>
                </div>
              </div>

              {/* Features */}
              <div className="space-y-4 mb-8">
                <div className="flex items-center gap-3">
                  <Check className="w-5 h-5 text-[#00A3FF]" />
                  <span className="text-gray-300">Profit Target: <span className="text-white font-semibold">{plan.profitTarget}</span></span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="w-5 h-5 text-[#00A3FF]" />
                  <span className="text-gray-300">Daily Drawdown: <span className="text-white font-semibold">{plan.dailyDrawdown}</span></span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="w-5 h-5 text-[#00A3FF]" />
                  <span className="text-gray-300">Max Drawdown: <span className="text-white font-semibold">{plan.maxDrawdown}</span></span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="w-5 h-5 text-[#00A3FF]" />
                  <span className="text-gray-300">Live Trading Dashboard</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="w-5 h-5 text-[#00A3FF]" />
                  <span className="text-gray-300">24/7 Support</span>
                </div>
              </div>

              {/* CTA Button */}
              <Link
                href="/register"
                className={`block w-full py-4 text-center rounded-lg font-semibold transition-all ${
                  plan.featured
                    ? 'bg-gradient-to-r from-[#00A3FF] to-[#0080CC] text-white hover:shadow-lg hover:shadow-[#00A3FF]/40'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                Get Funded
              </Link>
            </div>
          ))}
        </div>

        {/* Note */}
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500">
            All challenges include access to our professional trading platform and real-time market data.
          </p>
        </div>
      </div>
    </section>
  );
}
