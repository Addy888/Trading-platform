'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  AssetsFundedNavbar,
  HeroSection,
  MarketTicker,
  FeaturesSection,
  StatsSection,
  ChallengeSelection,
  HowItWorksSection,
  FAQSection,
  FinalCTA,
  AssetsFundedFooter,
} from '@/components/landing-v2';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-[#00A3FF] border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-300">Loading...</span>
        </div>
      </div>
    );
  }

  // If user is logged in, they'll be redirected, but show landing page during check
  return (
    <div className="min-h-screen bg-black">
      <AssetsFundedNavbar />
      <main>
        <HeroSection />
        <MarketTicker />
        <FeaturesSection />
        <StatsSection />
        <ChallengeSelection />
        <HowItWorksSection />
        <FAQSection />
        <FinalCTA />
      </main>
      <AssetsFundedFooter />
    </div>
  );
}
