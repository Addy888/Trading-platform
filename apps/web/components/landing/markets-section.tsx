'use client';

export function MarketsSection() {
  const markets = [
    {
      name: 'Forex',
      icon: '💱',
      description: 'Major, minor and exotic currency pairs',
      examples: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD'],
    },
    {
      name: 'Commodities',
      icon: '🏆',
      description: 'Precious metals and energy products',
      examples: ['Gold', 'Silver', 'Oil', 'Natural Gas'],
    },
    {
      name: 'Indices',
      icon: '📊',
      description: 'Global stock market indices',
      examples: ['S&P 500', 'NASDAQ', 'DAX', 'FTSE 100'],
    },
    {
      name: 'Crypto',
      icon: '₿',
      description: 'Major cryptocurrencies',
      examples: ['BTC/USD', 'ETH/USD', 'BNB/USD', 'SOL/USD'],
    },
  ];

  return (
    <section id="markets" className="py-20 px-6 relative">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16 animate-fade-in-up">
          <h2 className="text-4xl sm:text-5xl font-bold text-[#F5F7F4] mb-4">
            Supported Markets
          </h2>
          <p className="text-lg text-[#999F99] max-w-2xl mx-auto">
            Trade across multiple asset classes with competitive spreads and real-time execution
          </p>
        </div>

        {/* Markets Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {markets.map((market, index) => (
            <div
              key={index}
              className="group bg-[#101310]/60 backdrop-blur-xl rounded-xl p-6 border border-white/10 hover:border-[#B8FF85]/50 transition-all duration-300 hover:shadow-lg hover:shadow-[#B8FF85]/10 hover:-translate-y-1"
            >
              <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">
                {market.icon}
              </div>
              <h3 className="text-xl font-bold text-[#F5F7F4] mb-2">
                {market.name}
              </h3>
              <p className="text-sm text-[#999F99] mb-4">{market.description}</p>
              <div className="flex flex-wrap gap-2">
                {market.examples.map((example, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 bg-[#070908] text-[#B8FF85] text-xs rounded border border-[#B8FF85]/20"
                  >
                    {example}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
