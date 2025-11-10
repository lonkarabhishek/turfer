# TapTurf SEO Implementation Guide

## ✅ What's Already Implemented

### 1. Basic SEO Foundation
- **robots.txt** - Tells search engines what to crawl
- **sitemap.xml** - Lists all important pages for search engines
- **Custom useSEO Hook** - Dynamically updates meta tags for each page
- **Structured Data Generators** - For turfs (LocalBusiness) and games (SportsEvent)

### 2. Static Meta Tags (index.html)
- Title, description, keywords
- Open Graph tags (Facebook sharing)
- Twitter Card tags
- JSON-LD structured data for Organization and WebApplication
- Canonical URL

## 🚀 How to Use the SEO Hook

### Example 1: Turf Detail Page

```tsx
import { useSEO, generateTurfSchema } from '../hooks/useSEO';

export function TurfDetailPage({ turf }: { turf: TurfData }) {
  // Add dynamic SEO for this specific turf
  useSEO({
    title: `${turf.name} - Book Now`,
    description: `Book ${turf.name} in ${turf.address}. Rated ${turf.rating}⭐ by ${turf.totalReviews} players. Premium sports facility with best amenities.`,
    keywords: `${turf.name}, turf booking, sports facility, ${turf.address}, book turf online`,
    ogImage: turf.images?.[0] || 'https://www.tapturf.in/turfer-favicon.png',
    ogType: 'place',
    canonicalUrl: `https://www.tapturf.in/turf/${turf.id}`,
    structuredData: generateTurfSchema(turf)
  });

  return (
    // Your component JSX
  );
}
```

### Example 2: Sport Page

```tsx
import { useSEO } from '../hooks/useSEO';

export function SportPage({ sport }: { sport: string }) {
  useSEO({
    title: `${sport} Turfs & Games`,
    description: `Find ${sport.toLowerCase()} turfs and join games near you. Best ${sport.toLowerCase()} facilities and active community.`,
    keywords: `${sport.toLowerCase()}, ${sport.toLowerCase()} turf, ${sport.toLowerCase()} games, play ${sport.toLowerCase()}, ${sport.toLowerCase()} booking`,
    canonicalUrl: `https://www.tapturf.in/sport/${sport.toLowerCase()}`
  });

  return (
    // Your component JSX
  );
}
```

### Example 3: Game Detail Page

```tsx
import { useSEO, generateGameSchema } from '../hooks/useSEO';

export function GameDetailPage({ game }: { game: GameData }) {
  useSEO({
    title: `Join ${game.format} Game at ${game.turfName}`,
    description: `${game.maxPlayers - game.currentPlayers} spots left! ${game.format} game on ${game.date}. ₹${game.costPerPerson} per person.`,
    keywords: `${game.format}, join game, ${game.turfName}, play ${game.format}`,
    canonicalUrl: `https://www.tapturf.in/game/${game.id}`,
    structuredData: generateGameSchema(game)
  });

  return (
    // Your component JSX
  );
}
```

## 📋 SEO Checklist for Each Page Type

### Homepage
- [x] Static meta tags in index.html
- [x] Organization schema
- [x] WebApplication schema

### Turf Pages
- [ ] Use `useSEO` hook with turf-specific data
- [ ] Use `generateTurfSchema` for LocalBusiness structured data
- [ ] Include turf name, address, rating in title/description
- [ ] Use turf image as og:image

### Game Pages
- [ ] Use `useSEO` hook with game-specific data
- [ ] Use `generateGameSchema` for SportsEvent structured data
- [ ] Include sport, date, location in title/description

### Sport Pages
- [x] Use `useSEO` hook (already implemented in this guide)
- [ ] Include sport name in title/description
- [ ] Dynamic keyword generation

### Search/List Pages
- [ ] Use `useSEO` hook with relevant filters
- [ ] Include location, sport type in meta tags

## 🎯 Next Steps for Better SEO

### Priority 1 - Immediate Impact

1. **Add SEO to All Key Pages**
   ```bash
   # Pages to update:
   - src/components/TurfDetailPageEnhanced.tsx ✓ (example below)
   - src/components/GameDetailPage.tsx
   - src/components/SportPage.tsx ✓ (example below)
   - src/components/TurfSearch.tsx
   ```

2. **Update Sitemap Regularly**
   - Generate sitemap dynamically from database
   - Include all turf pages: `/turf/{id}`
   - Include all active games: `/game/{id}`
   - Run weekly via cron job or build script

3. **Add More Structured Data**
   - BreadcrumbList for navigation
   - FAQPage for common questions
   - Review schema for turf reviews

### Priority 2 - Performance & UX

4. **Optimize Core Web Vitals**
   - Lazy load images below fold
   - Pre-connect to external domains
   - Minimize JavaScript bundle
   - Use Vercel Edge caching

5. **Add Internal Linking**
   - Breadcrumbs on all pages
   - Related turfs section
   - Popular games section
   - Cross-link sports pages

6. **Mobile Optimization**
   - Responsive images with srcset
   - Touch-friendly buttons (already good)
   - Fast loading on 3G/4G

### Priority 3 - Advanced SEO

7. **Pre-rendering or SSR**
   ```bash
   # Options:
   1. Migrate to Next.js (SSR + SSG)
   2. Use Prerender.io service
   3. Use react-snap for static pre-rendering
   ```

8. **Rich Snippets**
   - Star ratings in search results (via Review schema)
   - Price information
   - Availability status
   - Location maps

9. **Local SEO**
   - Add city-specific pages
   - Google My Business integration
   - Local citations and backlinks

## 🔍 SEO Best Practices

### Content Quality
- **Unique Descriptions**: Each turf/game needs unique description
- **Keyword Research**: Use Google Keyword Planner for popular searches
- **Natural Language**: Write for humans first, search engines second

### Technical SEO
- **Page Speed**: Aim for <3s load time
- **Mobile-First**: Test on real devices
- **HTTPS**: Already enabled ✓
- **Clean URLs**: Use semantic URLs (already good) ✓

### Link Building
- **Internal Links**: Cross-link related content
- **External Links**: Get listed on sports directories
- **Social Signals**: Encourage sharing on social media

## 📊 Monitoring & Analytics

### Tools to Use
1. **Google Search Console** - Track search performance
2. **Google Analytics** - Already installed via Vercel ✓
3. **PageSpeed Insights** - Monitor Core Web Vitals
4. **Ahrefs/SEMrush** - Keyword tracking (paid)

### Key Metrics to Track
- Organic search traffic
- Click-through rate (CTR)
- Average position in search results
- Core Web Vitals (LCP, FID, CLS)
- Page load time
- Bounce rate

## 🛠️ Dynamic Sitemap Generator (TODO)

Create a script to generate sitemap from database:

```typescript
// scripts/generate-sitemap.ts
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function generateSitemap() {
  const { data: turfs } = await supabase.from('turfs').select('id, updated_at');
  const { data: games } = await supabase.from('games').select('id, updated_at');

  const urls = [
    { loc: '/', priority: 1.0 },
    { loc: '/find-turfs', priority: 0.9 },
    { loc: '/find-games', priority: 0.9 },
    ...turfs.map(t => ({ loc: `/turf/${t.id}`, lastmod: t.updated_at, priority: 0.8 })),
    ...games.map(g => ({ loc: `/game/${g.id}`, lastmod: g.updated_at, priority: 0.7 }))
  ];

  const xml = generateXML(urls);
  fs.writeFileSync('public/sitemap.xml', xml);
}
```

## 🎁 Quick Wins (Do These First!)

1. ✅ Add robots.txt (Done!)
2. ✅ Create sitemap.xml (Done!)
3. ✅ Create useSEO hook (Done!)
4. ⏳ Add SEO to TurfDetailPageEnhanced
5. ⏳ Add SEO to SportPage
6. ⏳ Add SEO to GameDetailPage
7. ⏳ Submit sitemap to Google Search Console
8. ⏳ Enable Vercel Analytics Pro (better insights)
9. ⏳ Add FAQ page with schema
10. ⏳ Create city-specific landing pages

## 🚨 Common SEO Mistakes to Avoid

1. ❌ Duplicate title tags across pages
2. ❌ Missing meta descriptions
3. ❌ Broken internal links
4. ❌ Slow page load times
5. ❌ Not mobile-friendly
6. ❌ Missing alt tags on images
7. ❌ Thin content (< 300 words)
8. ❌ Keyword stuffing
9. ❌ Not updating sitemap regularly
10. ❌ Ignoring Core Web Vitals

## 📞 Support & Resources

- **Google Search Console**: https://search.google.com/search-console
- **Schema.org**: https://schema.org/docs/schemas.html
- **SEO Testing**: https://www.seobility.net/en/seocheck/
- **Rich Results Test**: https://search.google.com/test/rich-results

---

**Last Updated**: January 2025
**Next Review**: February 2025
