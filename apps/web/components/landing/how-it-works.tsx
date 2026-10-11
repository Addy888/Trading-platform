'use client';

export function HowItWorksSection() {
  const steps = [
    {
      number: '01',
      title: 'Create Account',
      description: 'Sign up and complete the registration process in minutes.',
    },
    {
      number: '02',
      title: 'Choose Challenge',
      description: 'Select a trading challenge plan that matches your experience level.',
    },
    {
      number: '03',
      title: 'Start Trading',
      description: 'Access the trading terminal and begin executing trades on live markets.',
    },
    {
      number: '04',
      title: 'Track Performance',
      description: 'Monitor your progress with real-time analytics and comprehensive reports.',
    },
  ];

  return (
    <section id="how-it-works" className="py-20 px-6 relative">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16 animate-fade-in-up">
          <h2 className="text-4xl sm:text-5xl font-bold text-[#F5F7F4] mb-4">
            How It Works
          </h2>
          <p className="text-lg text-[#999F99] max-w-2xl mx-auto">
            Get started with trading in four simple steps
          </p>
        </div>

        {/* Steps */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 relative">
          {/* Connecting line - desktop only */}
          <div className="hidden lg:block absolute top-16 left-0 right-0 h-0.5 bg-gradient-to-r from-[#B8FF85]/50 via-cyan-500/50 to-[#B8FF85]/50"></div>

          {steps.map((step, index) => (
            <div key={index} className="relative">
              {/* Step Card */}
              <div className="bg-[#101310]/60 backdrop-blur-xl rounded-xl p-6 border border-white/10 hover:border-[#B8FF85]/50 transition-all duration-300 hover:shadow-lg hover:shadow-[#B8FF85]/10">
                {/* Number Badge */}
                <div className="relative z-10 w-12 h-12 bg-gradient-to-br from-[#B8FF85] to-[#6ee7b7] rounded-full flex items-center justify-center text-[#070908] font-bold text-lg mb-6 shadow-lg">
                  {step.number}
                </div>

                <h3 className="text-xl font-bold text-[#F5F7F4] mb-3">
                  {step.title}
                </h3>
                <p className="text-[#999F99] leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
