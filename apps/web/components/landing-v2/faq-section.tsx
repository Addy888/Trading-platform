'use client';

import { useState } from 'react';
import { Plus, Minus } from 'lucide-react';

const faqs = [
  {
    question: 'What is ASSETS FUNDED?',
    answer: 'ASSETS FUNDED is a proprietary trading platform that provides traders with the opportunity to prove their skills and access funded trading accounts. We evaluate your trading performance and provide capital to successful traders.',
  },
  {
    question: 'How do challenges work?',
    answer: 'Choose a challenge with an account size that matches your goals, trade according to the rules, and demonstrate consistent profitability. Once you pass the challenge requirements, you qualify for a funded account.',
  },
  {
    question: 'What are the trading rules?',
    answer: 'Our rules include profit targets, daily loss limits, and maximum drawdown limits. Each challenge clearly displays all requirements upfront with no hidden clauses. Rules are designed to encourage disciplined risk management.',
  },
  {
    question: 'How is performance evaluated?',
    answer: 'We track your trading metrics including profit/loss, drawdown, win rate, and risk management. All performance data is available in real-time through your trading dashboard with detailed analytics.',
  },
  {
    question: 'How can I access my trading dashboard?',
    answer: 'Once registered, you can log in anytime to access your professional trading dashboard with live charts, market data, position management, and performance tracking.',
  },
  {
    question: 'How do payouts work?',
    answer: 'Successful funded traders can request payouts according to their profit share agreement. Payout schedules and profit splits are clearly defined in your challenge terms.',
  },
];

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="relative py-24 bg-black">
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-black text-white mb-4">
            Frequently Asked <span className="text-[#00A3FF]">Questions</span>
          </h2>
          <p className="text-xl text-gray-400">
            Everything you need to know about getting funded
          </p>
        </div>

        {/* FAQ Accordion */}
        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:border-[#00A3FF]/30"
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full px-8 py-6 flex items-center justify-between text-left transition-colors hover:bg-white/5"
              >
                <span className="text-lg font-semibold text-white pr-8">{faq.question}</span>
                <div className={`flex-shrink-0 w-8 h-8 bg-[#00A3FF]/20 rounded-lg flex items-center justify-center transition-transform ${openIndex === index ? 'rotate-180' : ''}`}>
                  {openIndex === index ? (
                    <Minus className="w-5 h-5 text-[#00A3FF]" />
                  ) : (
                    <Plus className="w-5 h-5 text-[#00A3FF]" />
                  )}
                </div>
              </button>
              
              {openIndex === index && (
                <div className="px-8 pb-6">
                  <p className="text-gray-400 leading-relaxed">{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Contact CTA */}
        <div className="mt-16 text-center">
          <p className="text-gray-400 mb-4">Still have questions?</p>
          <a
            href="mailto:support@assetsfunded.com"
            className="inline-block px-6 py-3 bg-white/10 border border-white/20 text-white rounded-lg font-medium hover:bg-white/20 transition-all"
          >
            Contact Support
          </a>
        </div>
      </div>
    </section>
  );
}
