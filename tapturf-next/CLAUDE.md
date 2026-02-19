# TapTurf - Next.js App

## What is this?
TapTurf (tapturf.in) is a turf booking + sports games platform for Nashik, India. This is the Next.js 16 App Router migration of the original Vite React SPA at `../src/`.

## Tech Stack
- **Framework**: Next.js 16 App Router with Turbopack
- **Styling**: Tailwind CSS v4 (CSS-based `@theme inline` in globals.css, NOT tailwind.config.ts)
- **Database**: Supabase PostgreSQL at `hwfsbpzercuoshodmnuf.supabase.co`
- **Auth**: Firebase Phone OTP + Google OAuth via Supabase
- **Deployment**: Vercel (root directory set to `tapturf-next`)
- **Images**: Google Drive URLs with native `<img>` tags + `referrerPolicy="no-referrer"`

## Design System
Airbnb-inspired: clean whitespace, `rounded-2xl` cards, `shadow-elevated`, frosted glass header (`backdrop-blur-sm`), pill-shaped buttons, `section-divider` class for content separation. Primary: `#00A699`, Accent: `#FF385C`.

## Architecture

### Pages (66 total)
- `/` — Home page (SSG, 10min revalidation)
- `/turfs` — Turf listing with client-side filtering
- `/turf/[id]` — 49 individual turf pages (SSG with `generateStaticParams`)
- `/sport/[sport]` — 6 sport category pages (football, cricket, basketball, tennis, pickleball, badminton)
- `/games` — Games listing with sport/skill filters
- `/game/[id]` — Game detail with join request flow
- `/game/create` — 4-step game creation wizard (protected)
- `/dashboard` — User dashboard with tabs: Games, Requests, Notifications, Profile (protected)
- `/api/auth/callback` — Supabase OAuth callback

### Auth Flow
- **Phone OTP**: Firebase sends SMS → verify OTP → check/create user in Supabase `users` table → store in localStorage
- **Google**: Supabase `signInWithOAuth` → callback route → `onAuthStateChange` picks it up → ensure user in DB
- **AuthProvider** wraps entire app via `AuthWrapper` in layout.tsx
- **Protected routes**: `/game/create` and `/dashboard` redirect to login if not authenticated

### Key Directories
```
components/
  auth/       — AuthProvider, LoginModal, PhoneOTPForm, AuthWrapper
  game/       — GameCard, GameDetailClient, CreateGameFlow, GamesListingClient, GameRequestCard
  dashboard/  — DashboardClient, MyGames, MyRequests, NotificationsList, ProfileSection
  turf/       — TurfCard, TurfImageGallery, TurfMap, TurfPricing, TurfAmenities, TurfDetails
  layout/     — Header (client, with auth), Footer, MobileNav (fixed bottom bar)
  ui/         — CTAButtons, StarRating, ExternalImage, Badge, SportChip
  search/     — TurfListingClient
lib/
  supabase/   — client.ts (browser), server.ts (SSG/SSR read-only)
  firebase/   — client.ts (phone OTP helpers)
  queries/    — games.ts, notifications.ts, users.ts, turfs.ts
  utils/      — game.ts (date/time formatting, expiry), images.ts, prices.ts, seo.ts
types/        — game.ts, user.ts, notification.ts, turf.ts
```

### Database Tables
- `users` — id, name, email, phone, role, profile_image_url
- `turfs` — id, name, address, sports, amenities, images, pricing fields, "Gmap Embed link"
- `games` — id, creator_id, turf_id, sport, date, start_time, end_time, max_players, current_players, price_per_player, status, host_name
- `game_requests` — id, game_id, user_id, status (pending/accepted/declined), requester_name, note
- `game_participants` — game_id, user_id, joined_at
- `notifications` — id, user_id, type, title, message, metadata, is_read

### Environment Variables (.env.local)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Firebase config is hardcoded in `lib/firebase/client.ts` (project: tapturf)

## Important Conventions
- Mobile-first (70%+ mobile traffic). Bottom nav on mobile, footer hidden on mobile.
- Use `section-divider` class for content separation (not `<hr>`)
- Google Drive images: always use native `<img>` with `referrerPolicy="no-referrer"` and `onError` fallback
- Supabase turfs table uses `"Gmap Embed link"` (with quotes, capital G, spaces) as column name
- Game queries fetch turfs separately (no JOINs) to avoid RLS issues
- Dual auth: localStorage for phone users, Supabase session for Google users

## Build & Run
```bash
npm run dev          # Dev server (Turbopack)
npx next build       # Production build
npx next start -p 3005  # Production server
```

## Original SPA Reference
The old Vite SPA is at `../src/`. Key files to reference when porting:
- `src/lib/supabase.ts` — gameHelpers, gameRequestHelpers, notificationHelpers
- `src/lib/gameUtils.ts` — expiry logic
- `src/lib/gameTransformers.ts` — date/time formatting
- `src/hooks/useAuth.ts` — dual auth pattern
- `database/supabase-schema.sql` — full DB schema
