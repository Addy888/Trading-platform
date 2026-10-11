'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { LandingHeader } from '@/components/landing/header';
import { Hero } from '@/components/landing/hero';
import { DashboardPreview } from '@/components/landing/dashboard-preview';
import { MarketsSection } from '@/components/landing/markets-section';
import { FeaturesSection } from '@/components/landing/features-section';
import { HowItWorksSection } from '@/components/landing/how-it-works';
import { CTASection } from '@/components/landing/cta-section';
import { LandingFooter } from '@/components/landing/footer';

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
      <div className="min-h-screen flex items-center justify-center bg-[#070908]">
        <div className="text-[#F5F7F4]">Loading...</div>
      </div>
    );
  }

  // If user is logged in, they'll be redirected, but show landing page during check
  return (
    <div className="min-h-screen bg-[#070908]">
      <LandingHeader />
      <main>
        <Hero />
        <DashboardPreview />
        <MarketsSection />
        <FeaturesSection />
        <HowItWorksSection />
        <CTASection />
      </main>
      <LandingFooter />
    </div>
  );
}
