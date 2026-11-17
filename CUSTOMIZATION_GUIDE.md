# ASSETS FUNDED - Customization Guide

This guide explains how to replace placeholder data with real data from your backend APIs.

---

## 1. Market Ticker (Real-Time Data)

**File**: `apps/web/components/landing-v2/market-ticker.tsx`

### Current (Placeholder)
```typescript
const [marketData, setMarketData] = useState<MarketData[]>([
  { symbol: 'EUR/USD', price: '1.0845', change: '+0.0012', changePercent: '+0.11%' },
  // ... hardcoded data
]);
```

### Replace With API Integration
```typescript
import { useEffect, useState } from 'react';

export function MarketTicker() {
  const [marketData, setMarketData] = useState<MarketData[]>([]);

  useEffect(() => {
    // Fetch from your existing market data API
    fetch('http://localhost:3001/api/market-data/ticker')
      .then(res => res.json())
      .then(data => setMarketData(data))
      .catch(err => console.error('Market data error:', err));
    
    // Optional: Set up WebSocket for real-time updates
    const ws = new WebSocket('ws://localhost:3001/trading');
    ws.onmessage = (event) => {
      const update = JSON.parse(event.data);
      // Update market data in real-time
    };
    
    return () => ws.close();
  }, []);

  // Rest of component...
}
```

### Backend Endpoint Needed
```typescript
// apps/api/src/market-data/market-data.controller.ts
@Get('ticker')
async getTickerData() {
  // Return array of:
  // { symbol, price, change, changePercent }
}
```

---

## 2. Challenge Plans (Database)

**File**: `apps/web/components/landing-v2/challenge-selection.tsx`

### Current (Placeholder)
```typescript
const [plans, setPlans] = useState<ChallengePlan[]>([
  {
    id: '1',
    name: 'Starter',
    accountSize: '$10,000',
    price: '$99',
    // ... hardcoded
  },
]);
```

### Replace With API Fetch
```typescript
import { useEffect, useState } from 'react';

interface ChallengePlan {
  id: string;
  name: string;
  accountSize: string;  // or Decimal from Prisma
  price: string;        // or Decimal from Prisma
  profitTarget: string;
  dailyDrawdown: string;
  maxDrawdown: string;
  description?: string;
  status: string;
}

export function ChallengeSelection() {
  const [plans, setPlans] = useState<ChallengePlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:3001/api/challenge-plans/public')
      .then(res => res.json())
      .then(data => {
        // Transform Prisma data to display format
        const formatted = data.map((plan: any) => ({
          id: plan.id,
          name: plan.name,
          accountSize: `$${parseFloat(plan.accountSize).toLocaleString()}`,
          price: `$${parseFloat(plan.price).toFixed(0)}`,
          profitTarget: plan.profitTarget || '8%',
          dailyDrawdown: plan.dailyDrawdown || '5%',
          maxDrawdown: plan.maxDrawdown || '10%',
        }));
        setPlans(formatted);
      })
      .catch(err => console.error('Challenge plans error:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div>Loading challenges...</div>;
  }

  // Rest of component...
}
```

### Backend Endpoint Needed
```typescript
// apps/api/src/challenge-plans/challenge-plans.controller.ts
@Get('public')
async getPublicPlans() {
  return this.prisma.challengePlan.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      description: true,
      accountSize: true,
      price: true,
      // Add fields for profit target, drawdown from ruleSet
    },
    orderBy: { accountSize: 'asc' },
  });
}
```

### Database Schema Reference
```prisma
model ChallengePlan {
  id          String   @id @default(uuid())
  name        String
  description String?
  accountSize Decimal  @db.Decimal(12, 2)
  price       Decimal  @db.Decimal(10, 2)
  currency    String   @default("USD")
  status      ChallengeStatus
  ruleSetId   String
  ruleSet     RuleSet  @relation(...)
  // ...
}
```

---

## 3. Platform Statistics (Analytics)

**File**: `apps/web/components/landing-v2/stats-section.tsx`

### Current (Placeholder)
```typescript
const stats = [
  {
    icon: Users,
    value: '10,000+',
    label: 'Active Traders',
    description: 'Traders worldwide',
  },
  // ... hardcoded
];
```

### Replace With API Data
```typescript
import { useEffect, useState } from 'react';

interface PlatformStats {
  activeTraders: number;
  totalAUM: number;
  countries: number;
  successRate: number;
}

export function StatsSection() {
  const [stats, setStats] = useState<PlatformStats | null>(null);

  useEffect(() => {
    fetch('http://localhost:3001/api/analytics/platform-stats')
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(err => {
        console.error('Stats error:', err);
        // Fallback to placeholder if API fails
      });
  }, []);

  const displayStats = [
    {
      icon: Users,
      value: stats?.activeTraders 
        ? `${(stats.activeTraders / 1000).toFixed(1)}K+` 
        : 'Loading...',
      label: 'Active Traders',
      description: 'Traders worldwide',
    },
    {
      icon: DollarSign,
      value: stats?.totalAUM 
        ? `$${(stats.totalAUM / 1000000).toFixed(1)}M+` 
        : 'Loading...',
      label: 'Platform AUM',
      description: 'Assets under management',
    },
    // ...
  ];

  // Rest of component...
}
```

### Backend Endpoint Needed
```typescript
// apps/api/src/analytics/analytics.controller.ts
@Get('platform-stats')
async getPlatformStats() {
  const [activeTraders, totalAUM, countries] = await Promise.all([
    this.prisma.user.count({ where: { isActive: true } }),
    this.prisma.tradingAccount.aggregate({
      where: { status: 'ACTIVE' },
      _sum: { currentBalance: true },
    }),
    this.prisma.user.groupBy({
      by: ['country'],
      where: { country: { not: null } },
    }),
  ]);

  return {
    activeTraders,
    totalAUM: parseFloat(totalAUM._sum.currentBalance || '0'),
    countries: countries.length,
    successRate: 0.85, // Calculate from actual data
  };
}
```

---

## 4. Testimonials (Future Enhancement)

**Create New Component**: `apps/web/components/landing-v2/testimonials-section.tsx`

### Structure
```typescript
'use client';

import { Star } from 'lucide-react';

interface Testimonial {
  id: string;
  name: string;
  role: string;
  country: string;
  image?: string;
  rating: number;
  text: string;
  verifiedTrader: boolean;
  createdAt: Date;
}

export function TestimonialsSection() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);

  useEffect(() => {
    fetch('http://localhost:3001/api/testimonials/approved')
      .then(res => res.json())
      .then(data => setTestimonials(data));
  }, []);

  return (
    <section className="relative py-24 bg-black">
      <div className="max-w-7xl mx-auto px-4">
        <h2 className="text-4xl font-black text-white text-center mb-16">
          What <span className="text-[#00A3FF]">Traders</span> Say
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((testimonial) => (
            <div key={testimonial.id} className="p-6 bg-white/5 border border-white/10 rounded-2xl">
              <div className="flex items-center gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-5 h-5 ${
                      i < testimonial.rating
                        ? 'fill-[#00A3FF] text-[#00A3FF]'
                        : 'text-gray-600'
                    }`}
                  />
                ))}
              </div>
              <p className="text-gray-300 mb-4">{testimonial.text}</p>
              <div className="flex items-center gap-3">
                {testimonial.image && (
                  <img src={testimonial.image} alt={testimonial.name} className="w-10 h-10 rounded-full" />
                )}
                <div>
                  <div className="font-semibold text-white">{testimonial.name}</div>
                  <div className="text-sm text-gray-400">{testimonial.country}</div>
                </div>
                {testimonial.verifiedTrader && (
                  <span className="ml-auto text-xs bg-[#00A3FF]/20 text-[#00A3FF] px-2 py-1 rounded">
                    ✓ Verified
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

### Database Schema Needed
```prisma
model Testimonial {
  id             String   @id @default(uuid())
  userId         String?
  name           String
  role           String?
  country        String?
  image          String?
  rating         Int      @default(5)
  text           String   @db.Text
  approved       Boolean  @default(false)
  verifiedTrader Boolean  @default(false)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user User? @relation(fields: [userId], references: [id])
  
  @@map("testimonials")
}
```

---

## 5. Trading Rules Page

**Create**: `apps/web/app/rules/page.tsx`

```typescript
'use client';

export default function TradingRulesPage() {
  return (
    <div className="min-h-screen bg-black pt-24 pb-12">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-5xl font-black text-white mb-8">
          Trading <span className="text-[#00A3FF]">Rules</span>
        </h1>
        
        <div className="space-y-8">
          <section className="p-6 bg-white/5 border border-white/10 rounded-2xl">
            <h2 className="text-2xl font-bold text-white mb-4">Profit Targets</h2>
            <p className="text-gray-300">
              Demonstrate consistent profitability by achieving the specified profit target for your challenge level...
            </p>
          </section>

          <section className="p-6 bg-white/5 border border-white/10 rounded-2xl">
            <h2 className="text-2xl font-bold text-white mb-4">Drawdown Limits</h2>
            <p className="text-gray-300">
              Daily Loss Limit: Maximum loss allowed in a single trading day...
              Maximum Drawdown: Total account drawdown limit...
            </p>
          </section>

          <section className="p-6 bg-white/5 border border-white/10 rounded-2xl">
            <h2 className="text-2xl font-bold text-white mb-4">Trading Guidelines</h2>
            <ul className="text-gray-300 space-y-2">
              <li>• Minimum trading days: [X] days</li>
              <li>• Risk per trade: Maximum [X]%</li>
              <li>• News trading: [Allowed/Not allowed]</li>
              <li>• Weekend trading: [Allowed/Not allowed]</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
```

---

## 6. Legal Pages Updates

### Terms & Conditions
**File**: `apps/web/app/terms/page.tsx`

Update with ASSETS FUNDED specific terms:
- Company name
- Legal entity
- Jurisdiction
- Specific challenge terms
- Payout policies
- Liability clauses

### Privacy Policy
**File**: `apps/web/app/privacy/page.tsx`

Update with:
- Data collection practices
- ASSETS FUNDED company details
- GDPR compliance
- Cookie policies
- Third-party integrations

### Risk Disclosure
**File**: `apps/web/app/risk-disclosure/page.tsx`

Update with:
- Trading risks specific to your platform
- Leverage warnings
- Performance disclaimers
- Regulatory notices

---

## 7. Environment Variables

Add these to `.env.local`:

```bash
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_WS_URL=ws://localhost:3001

# Feature Flags
NEXT_PUBLIC_ENABLE_LIVE_TICKER=true
NEXT_PUBLIC_ENABLE_TESTIMONIALS=false
NEXT_PUBLIC_ENABLE_BLOG=false

# Analytics
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX

# Social Media
NEXT_PUBLIC_TWITTER_URL=https://twitter.com/assetsfunded
NEXT_PUBLIC_LINKEDIN_URL=https://linkedin.com/company/assetsfunded
NEXT_PUBLIC_DISCORD_URL=https://discord.gg/assetsfunded
```

---

## 8. SEO Enhancements

### Add Open Graph Image

1. Create OG image: `1200x630px` with ASSETS FUNDED branding
2. Save to: `apps/web/public/og-image.png`
3. Update `layout.tsx`:

```typescript
export const metadata: Metadata = {
  title: "ASSETS FUNDED | Premium Prop Trading Platform",
  description: "Trade bigger, think smarter, get funded...",
  openGraph: {
    title: "ASSETS FUNDED | Premium Prop Trading Platform",
    description: "Trade bigger, think smarter, get funded...",
    images: ['/og-image.png'],
    url: 'https://assetsfunded.com',
    siteName: 'ASSETS FUNDED',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "ASSETS FUNDED | Premium Prop Trading Platform",
    description: "Trade bigger, think smarter, get funded...",
    images: ['/og-image.png'],
  },
};
```

---

## 9. Analytics Integration

### Google Analytics

```typescript
// app/layout.tsx
import Script from 'next/script';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}');
          `}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  );
}
```

---

## 10. Performance Monitoring

### Add Monitoring
```bash
npm install @vercel/analytics
```

```typescript
// app/layout.tsx
import { Analytics } from '@vercel/analytics/react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
```

---

## Summary

Replace placeholders in this order:

1. ✅ **Easy**: Legal pages content
2. ✅ **Easy**: Social media links in footer
3. ⚠️ **Medium**: Market ticker with real data
4. ⚠️ **Medium**: Challenge plans from database
5. ⚠️ **Medium**: Platform statistics from analytics
6. ⚠️ **Hard**: Testimonials system (requires new feature)
7. ⚠️ **Hard**: Trading rules page (requires content)

**Priority**: Focus on items 1-5 first for production launch.

---

For any questions or implementation help, refer to:
- `ASSETS_FUNDED_IMPLEMENTATION_REPORT.md` - Full technical details
- `QUICK_SUMMARY.md` - Quick overview
- `VERIFICATION_CHECKLIST.md` - Pre-launch checklist
