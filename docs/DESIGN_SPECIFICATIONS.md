# Trading Platform - Design Specifications

## Visual Design Reference

### Color Palette

```css
--background: #070908    /* Near-black primary background */
--surface: #101310       /* Elevated surface color */
--primary: #B8FF85       /* Lime-green accent (CTAs, highlights) */
--foreground: #F5F7F4    /* Off-white primary text */
--muted: #999F99         /* Muted gray secondary text */
```

### Additional Accent Colors
- Cyan: `#06b6d4` (ambient effects, gradients)
- Emerald: `#6ee7b7` (gradients, glows)
- Violet: `#8b5cf6` (accents, gradients)
- Red (warnings): `#ef4444`
- Green (success): `#22c55e`

## Layout Structure

### Landing Page Sections

```
┌─────────────────────────────────────────┐
│  HEADER (Sticky)                        │
│  Logo | Markets Trade Features Learn    │
│                      Sign Up | Start    │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  HERO SECTION                           │
│  ┌──────────────┬──────────────────┐   │
│  │  Left Col    │   Right Col      │   │
│  │  - Title     │   - 3D Visual    │   │
│  │  - Subtitle  │   - Glass sphere │   │
│  │  - CTAs      │   - Animations   │   │
│  │  - Stats     │                  │   │
│  └──────────────┴──────────────────┘   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  DASHBOARD PREVIEW (Overlapping)        │
│  ┌─────────────────────────────────┐   │
│  │  Glass Card - Trading Interface │   │
│  │  ┌────┬─────────────────────┐   │   │
│  │  │Side│ Main Content Area   │   │   │
│  │  │bar │ - Stats             │   │   │
│  │  │    │ - Chart             │   │   │
│  │  │    │ - Recent Trades     │   │   │
│  │  └────┴─────────────────────┘   │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  MARKETS SECTION                        │
│  ┌────┬────┬────┬────┐                 │
│  │Forex│Comm│Ind │Cry │                │
│  └────┴────┴────┴────┘                 │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  FEATURES SECTION                       │
│  ┌──────────┬──────────┐               │
│  │Feature 1 │Feature 2 │               │
│  ├──────────┼──────────┤               │
│  │Feature 3 │Feature 4 │               │
│  └──────────┴──────────┘               │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  HOW IT WORKS                           │
│  ┌───┬───┬───┬───┐                     │
│  │01 │02 │03 │04 │                     │
│  └───┴───┴───┴───┘                     │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  FINAL CTA                              │
│  Ready to Start Trading?                │
│  [Start Trading] [Sign In]              │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  FOOTER                                 │
│  Brand │ Platform │ Account │ Support   │
└─────────────────────────────────────────┘
```

## Component Hierarchy

### Page Structure
```
app/
├── page.tsx (Landing)
│   ├── LandingHeader
│   ├── Hero
│   ├── DashboardPreview
│   ├── MarketsSection
│   ├── FeaturesSection
│   ├── HowItWorksSection
│   ├── CTASection
│   └── LandingFooter
├── login/page.tsx
└── register/page.tsx

components/landing/
├── header.tsx
├── hero.tsx
├── dashboard-preview.tsx
├── markets-section.tsx
├── features-section.tsx
├── how-it-works.tsx
├── cta-section.tsx
└── footer.tsx
```

## Typography Scale

### Headings
- **H1 (Hero)**: 3.5rem - 4.5rem (56px - 72px), font-weight: 700
- **H2 (Sections)**: 2.5rem - 3rem (40px - 48px), font-weight: 700
- **H3 (Cards)**: 1.25rem - 1.5rem (20px - 24px), font-weight: 700
- **H4 (Labels)**: 0.875rem - 1rem (14px - 16px), font-weight: 600

### Body Text
- **Large**: 1.125rem - 1.25rem (18px - 20px)
- **Base**: 0.875rem - 1rem (14px - 16px)
- **Small**: 0.75rem - 0.875rem (12px - 14px)

## Spacing System

### Padding/Margin Scale
- **xs**: 0.25rem (4px)
- **sm**: 0.5rem (8px)
- **md**: 1rem (16px)
- **lg**: 1.5rem (24px)
- **xl**: 2rem (32px)
- **2xl**: 3rem (48px)
- **3xl**: 4rem (64px)
- **4xl**: 5rem (80px)

### Container Widths
- **Max Width**: 1280px (max-w-7xl)
- **Content Width**: 1024px (max-w-6xl)
- **Form Width**: 448px (max-w-md)

## Effects & Animations

### Glass Morphism
```css
.glass-effect {
  background: rgba(16, 19, 16, 0.6);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
```

### Glow Effects
```css
.glow-green {
  box-shadow: 0 0 20px rgba(184, 255, 133, 0.3),
              0 0 40px rgba(184, 255, 133, 0.1);
}
```

### Animation Timings
- **Fade In**: 0.8s ease-out
- **Slide Up**: 0.8s ease-out
- **Float**: 6s ease-in-out infinite
- **Hover**: 0.3s ease-in-out

### Blur Values
- **Background**: 120px (ambient glows)
- **Glass**: 20px (cards, overlays)
- **Particles**: 4px (floating elements)

## Interaction States

### Buttons (Primary - Lime Green)
```
Default:  bg-[#B8FF85] text-[#070908]
Hover:    bg-[#a8ef75] shadow-lg shadow-[#B8FF85]/30
Active:   scale-105
Focus:    ring-2 ring-[#B8FF85]
```

### Buttons (Secondary - Outline)
```
Default:  border-[#999F99]/30 text-[#F5F7F4]
Hover:    border-[#B8FF85]/50 bg-[#B8FF85]/5
```

### Cards
```
Default:  border-white/10
Hover:    border-[#B8FF85]/50 shadow-[#B8FF85]/10
         transform: translateY(-4px)
```

### Links
```
Default:  text-[#999F99]
Hover:    text-[#F5F7F4] or text-[#B8FF85]
```

## Responsive Breakpoints

### Tailwind Breakpoints
```
sm:  640px  (small tablets)
md:  768px  (tablets)
lg:  1024px (laptops)
xl:  1280px (desktops)
2xl: 1536px (large screens)
```

### Component Behavior

#### Navigation
- **Mobile**: Hamburger menu, stacked items
- **Desktop**: Horizontal layout, all items visible

#### Hero
- **Mobile**: Single column, no 3D visual
- **Tablet**: Single column with visual
- **Desktop**: Two columns with animated visual

#### Dashboard Preview
- **Mobile**: Single column, simplified layout
- **Tablet**: Simplified two-column
- **Desktop**: Full interface with sidebar

#### Feature Grid
- **Mobile**: 1 column
- **Tablet**: 2 columns
- **Desktop**: 2-4 columns

## Accessibility Requirements

### Color Contrast
- Text on dark background: Minimum 7:1 (AAA)
- Interactive elements: Minimum 4.5:1 (AA)
- Lime green buttons: High contrast with dark text

### Focus States
- Visible focus rings on all interactive elements
- Ring color: Lime green (#B8FF85)
- Ring width: 2px

### Motion
- All animations respect `prefers-reduced-motion`
- Alternative static styles provided
- No motion-only information conveyance

### Semantic HTML
- Proper heading hierarchy (h1 → h2 → h3)
- Landmark regions (header, main, footer)
- Button vs. link usage (buttons for actions, links for navigation)

## Browser Support

### Minimum Requirements
- Chrome/Edge: Last 2 versions
- Firefox: Last 2 versions
- Safari: Last 2 versions
- Mobile Safari: iOS 12+
- Chrome Mobile: Android 8+

### Progressive Enhancement
- Core functionality without JavaScript
- Fallbacks for backdrop-filter
- CSS Grid with Flexbox fallback
- Modern fonts with system fallback

## Performance Targets

### Core Web Vitals
- **LCP**: < 2.5s (Largest Contentful Paint)
- **FID**: < 100ms (First Input Delay)
- **CLS**: < 0.1 (Cumulative Layout Shift)

### Page Weight
- HTML/CSS: < 100KB
- JavaScript: < 200KB (initial bundle)
- Images: Optimized, lazy-loaded
- Fonts: Preloaded, subset

### Loading Strategy
- Critical CSS inlined
- Above-fold content priority
- Below-fold lazy loading
- Intersection observer for animations

---

**Implementation Status**: ✅ Complete  
**Last Updated**: October 11, 2026  
**Version**: 1.0
