# TapTurf - Next.js App

## What is this?
TapTurf (tapturf.in) is a turf directory + sports games platform for every city across India that has active turfs (88 on 26 Oct 2026; started in Nashik; biggest markets Hyderabad, Bangalore, Pune, Mumbai, Delhi). Never hardcode a city count or a city list: the live list and every count come from the `city_turf_counts` view via `lib/queries/cities.ts` (getLiveCities, getFooterCities, getCityCopy), and a city the data team adds shows up without a code change. `lib/city.ts` CITIES is the curated, biggest-first list of labels, states, centroids (CITY_COORDS) and other names (CITY_ALIASES); curate a new city there so IP/GPS detection and Ask know it. Copy and lists order cities by size, except "other cities" lists in a city view (/turfs, the city home, /<city>, /<city>/<sport>), which go nearest first: a city's point is its CITY_COORDS centroid, else the median of its turfs from city_turf_counts (lat, lng; `lib/city.ts` cityPoint), and detection still uses CITY_COORDS only. This is the Next.js 16 App Router migration of the original Vite React SPA at `../src/`.

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
- `/turfs` — Turf listing: the server renders the first 10 cards; search, sport chips, sorts and "Show more" (10, 20, 40, 80 at a time) fetch batches from `GET /api/turfs/list`, ranked by the same code (`lib/turfList/query.ts`, tests: `npm run test:list`). Every turf in scope is a plain A to Z link at the bottom. The same list (`components/search/TurfListingClient.tsx`) is the "Popular in <city>" list on `/<city>` (Top rated is its default sort) and the list on `/<city>/<sport>` (that page's turfs by its exact labels, `pageSport`, no chips; its 24 server cards as before, by rating with no trending lead, as its copy says). Its Filters sheet (`FilterSheet.tsx`: Open now in India time, Open 24 hours, Floodlights, Covered, Parking, Washroom, Changing room, 4.5+ on Google, Coaching, Equipment, price per hour up to, surface) is ranked and counted in `rankTurfs` from each turf's facts (counts only on a first batch asked with `counts=1`, while the sheet is open, so other batches stay time-free and shared; `lib/turfList/facts.ts`: a column or its amenity words; opening_hours, coaching and surface from an hourly cached read, `lib/queries/listFacts.ts`); its choices are `f`, `price` and `surface` in the page URL, which stays the same static page with the plain canonical.
- `/turf/[id]` — 49 individual turf pages (SSG with `generateStaticParams`)
- `/sport/[sport]` — sport pages from `lib/sports.ts` (football, box-cricket, cricket, badminton, pickleball, volleyball, basketball, tennis); exact label match, add new sports there. `venue` says turf or court (racquet/ball-court sports are "courts" in all copy)
- `/games` — Games listing with sport/skill filters
- `/game/[id]` — Game detail with join request flow
- `/game/create` — 4-step game creation wizard (protected)
- `/dashboard` — User dashboard with tabs: Games, Requests, Notifications, Profile, Passport (numbers, weekly streak, medals, stamps, reviewed turfs, played with; `lib/profile/`, `GET /api/me/passport`, tests: `npm run test:profile`) (protected)
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
  ui/         — CTAButtons, StarRating, ExternalImage, Badge
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
- `game_requests` — id, game_id, user_id, status (pending/accepted/declined/withdrawn), requester_name, note
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
- Games, join requests and notifications are written (and requests and notifications read) only through the games routes as the verified caller (`lib/games/server.ts`, API in `lib/games/types.ts`, tests: `npm run test:games`); the database lets the browser read only games and lineups (`supabase/migrations/20261030_games_lockdown*.sql`)
- Repeat games: the host picks a calendar-style repeat in the create flow (weekly on chosen days every 1 to 4 weeks, counted from the first game's week, or monthly on the date or the nth weekday; ending never (a year at most), on a date or after N). A series lives in `private.game_series`; its games are ordinary games with `games.series_id`, put up 4 weeks ahead (at most 8 not played, always the next one; a cancelled one doesn't count) at once and by a daily job, through `/api/game-series` (`supabase/migrations/20261102_game_series.sql`). `lib/games/repeat.ts` has the same maths for the preview; both are checked against `lib/games/repeat.cases.json` (`npm run test:games`, `scripts/sql-tests/game_series.check.mjs`). Players join each game on its own; the host books the turf for each date. /games and a turf's game list show each repeat once, its soonest game (`lib/utils/game.ts` oneGamePerRepeat); its page lists the next ones
- Traffic: every page shown sends one view to `POST /api/traffic` (`components/analytics/TrafficCounter.tsx` in the root layout, `lib/traffic/track.ts`), with or without cookie consent: nothing kept on the device, no identifier, no IP stored, no third-party code. A visit is the first view of a page load that came from outside the site on a real navigation (not a reload or Back); in-site moves are views. The source comes from the referrer host and utm_source only; the kind and path from the page (`lib/traffic/traffic.ts`, tests: `npm run test:traffic`). The server leaves out bots, prefetches, /admin, the API and the site owner's own signed-in views, and counts per India day in `private.traffic_*` (`supabase/migrations/20261104_traffic.sql`, `scripts/sql-tests/traffic.check.mjs`); the admin's Traffic section reads `admin_traffic`
- Ground sizes: owners give each ground's length, width and net height (feet or metres, stored in feet) on myTapturf, saved through `/api/my/ground-sizes` into `turfs.ground_sizes` (`supabase/migrations/20261102_turf_dimensions.sql`; checked against `lib/turfSize/cases.json` by `npm run test:turf` and `scripts/sql-tests/turf_dimensions.check.mjs`). The turf page's Ground size card (`components/turf/GroundSize.tsx`) and the owner's preview share `lib/turfSize/benchmark.ts`: size bands, "longer than 72% of turfs in Nashik" from 20 turfs with sizes (city from 10), and what a ground suits, all tunable constants there. Each ground's plain sentence (`groundSentence`: size in feet and metres and what it suits) leads its card and is the turf JSON-LD's `amenityFeature` (LocationFeatureSpecification, last key, only for turfs with sizes), so crawlers that run no JavaScript read it
- Roof: owners say Covered, Partly covered or Open air on myTapturf (`components/my/EditListing.tsx`), saved by `public.owner_set_roof` into `turfs.roof`, which keeps `is_covered` with it (covered true, partly and open false, not said null; `supabase/migrations/20261103_turf_facts.sql`, `scripts/sql-tests/turf_facts.check.mjs`). The lists and the Covered filter read `is_covered`; the turf page shows "Partly covered" from `roof`

## SEO & Metadata
- Titles and descriptions are built from each page's own data in `lib/seo/`: `turfMeta.ts` (turf pages), `listingMeta.ts` (home, city, city+sport, sport, near-me), `blogMeta.ts` (posts, with optional `seoTitle`/`seoDescription`; `npm run check:blog` checks them), `pageMetadata.ts` (home, /turfs, /games). Titles fit 60 characters and about 580px (`width.ts`), descriptions 155 characters. Shared robots/OG/Twitter pieces are in `defaults.ts`. Tests: `npm run test:seo`.
- Honest snippets: no booking claims (players call or WhatsApp the turf), no invented numbers or urgency. Google ratings may appear in visible text as "on Google", never in structured data. One exception, the site owner's call (4 Nov 2026): the /pune title alone reads "Turf Booking in Pune: N Turfs, Call or WhatsApp" (`BOOKING_TITLE_CITY` in `lib/seo/listingMeta.ts`); BANNED_COPY still holds everywhere else. Where people need to know how to book, the site owner's wording (5 Nov 2026) is "For bookings, contact the turf directly." (the venue, for a typed venue); never "TapTurf doesn't take bookings" or "we don't take bookings" in anything a person sees.
- City pages with fewer than 3 active turfs (`MIN_TURFS_TO_INDEX`) are `noindex, follow` and out of the sitemap (`cityPageIndexable` in `lib/queries/cities.ts`), as thin city+sport pages already were; they stay linked so their turfs are reachable, and a city becomes indexable again by itself at 3 turfs.
- Errors: `pages/500.tsx` is the static branded 500 page (noindex). When a page has no copy of its data fresh enough to show (a last good copy is used for at most an hour, `lib/cache/rowStore.ts`), it throws `Unavailable` (`lib/cache/unavailable.ts`) and `pages/_error.tsx` answers 503 with Retry-After, no-store and noindex, so stale hours or prices are never shown as current and nothing thin is cached. Vercel puts `_error`, `_app` and `_document` in every function but not `pages/500.js`, so `npm run build` adds the error pages and the files their traces list to every app route's trace after `next build` (`lib/build/errorPages.ts`, tests: `npm run test:build`); `outputFileTracingIncludes` cannot (with Turbopack it matches nothing under `.next/`).
- Every `<script type="application/ld+json">` uses `jsonLdHtml` from `lib/seo/jsonLd.ts` (escapes `<`, `>`, `&`), never raw `JSON.stringify`.
- A turf's JSON-LD carries `aggregateRating` only from TapTurf players' own live reports, at `AGGREGATE_RATING_MIN_REPORTS` (5, `lib/seo/defaults.ts`) or more. Listing pages carry no ratings.
- Turf photos on Google: only photos owners added on myTapturf (`turf-photos/owner/<turf>/<24 hex>[-card].<webp|jpg>`) are served from tapturf.in (`/photos/turf/...`, `app/photos/turf/[...path]/route.ts`, `lib/utils/images.ts` sitePhotoUrl), lead og:image and the turf JSON-LD image, and go in the image sitemap. The mirror job's copies of Google Maps photos keep their Supabase links (Supabase sends `x-robots-tag: none`), the site owner's call (2 Nov 2026). Tests: `npm run test:turf`, `npm run test:seo`.
- Games' SportsEvent JSON-LD (the game page and the /games ItemList of the first 20) is built in `lib/seo/gameJsonLd.ts`: organizer is the host as a Person with url, their public profile `/u/<username>` when it is shown, else the game page (`lib/games/hostProfile.ts`: players_search for `games.host_name`, kept only when profile_owner names the game's creator, no new database function; remembered 10 min per process, none while building); performer is the host by name; image is the game's own share card. The card (`GET /api/og/game/<id>`, 1200x630, also `/4x3` and `/1x1`; `lib/og/gameCard.ts`, drawn in `lib/og/gameCardImage.tsx`) says sport, venue, area and city, the stored India day and time and the spots, is the game page's og:image and twitter:image, and is drawn only in next/og's bundled Noto Sans (text the font lacks is left out, so it never fetches a font or emoji; capitals are made before that check, never with textTransform, and a long word shrinks the title or wraps, never runs off the card). Its URL carries `?v=` (a hash of what it says): a current URL is kept a day, any other 307s to the current one. Tests: `npm run test:seo`, `npm run test:games`.
- `/turf/<uuid>` (the turf URLs before 19 Oct) answers 308 to `/turf/<slug>` from the proxy (`proxy.ts`, `lib/turfIds.ts`), a Map lookup with no database read, query string kept: `npm run build` writes every active turf's id and slug from the build-data step's sitemap read into `lib/turfIds.json` before `next build` bundles it, then puts the committed `{}` back (`lib/build/turfIds.ts`; tests: `npm run test:build`). Anything not in the map (no slug, inactive, added since the deploy, a build with `TAPTURF_BUILD_DATA=off`) falls through to the page, whose `permanentRedirect` (`app/turf/[id]/page.tsx`) stays the fallback. The map is as of the deploy: a slug edited by hand or a turf switched off afterwards needs a redeploy, or its id link 308s to the old slug (a 404). The build log prints the map's md5, which equals `select md5(string_agg(id::text || ',' || slug, E'\n' order by id)) from public.turfs where is_active and slug is not null` while the map is current. Links, share text and JSON-LD use the slug (`lib/utils/turfPath.ts`), never the id.
- All-India listing pages stay small (Googlebot reads the first 2 MB of HTML): `/sport/<sport>` shows its top 24 venues as cards, then "<Sport> turfs by city" (`lib/byCity.ts`, `components/sport/ByCityLinks.tsx`): `/<city>/<sport>` where that page is indexable (`MIN_TURFS_TO_INDEX`), else `/<city>` when that has as many turfs, else "and N more cities". `/turf-near-me` shows the six biggest cities' top 8 as cards and links every live city's page, one turf or more (a city with fewer than 3 turfs is noindex, follow and out of the sitemap, `cityPageIndexable` in `lib/queries/cities.ts`, but stays linked so players and crawlers reach its turfs); its JSON-LD ItemList lists only the cards. Every turf is linked from its city and city+sport pages, not from these.

## Commits & Deploys
- Batch the work: commit to the working branch as you go, but merge into `main` (which deploys to production) once per batch, not after every commit.
- At most one production deploy a day (site owner, 4 Nov 2026): each deploy empties the page cache, and the refill strains the database. Exceptions ship right away, still with the usual checks: security fixes and bugs that break production.
- Pushing the working branch only makes a Vercel preview; only `main` goes live.

## Build & Run
```bash
npm run dev          # Dev server (Turbopack)
npm run build        # Production build: the build-data step, then next build
npx next start -p 3005  # Production server
```
`npm run build` (what Vercel runs) first reads every row the prerendered pages share, once, patiently (`scripts/build-data.ts`, waits out a slow database for up to 6 min, else fails and production keeps the last deploy), and `next build` prerenders from those files: page generation reads nothing from the database (`lib/build/data.ts`). A new shared read a prerendered page makes needs a hook there (`buildData`), or the build logs `build: a page read the database <path>` (`TAPTURF_BUILD_DATA_STRICT=1` makes that fail; `npm run test:build`). `TAPTURF_BUILD_DATA=off npm run build` (or `npx next build`) builds without the step, as before, e.g. with no database.

## Original SPA Reference
The old Vite SPA is at `../src/`. Key files to reference when porting:
- `src/lib/supabase.ts` — gameHelpers, gameRequestHelpers, notificationHelpers
- `src/lib/gameUtils.ts` — expiry logic
- `src/lib/gameTransformers.ts` — date/time formatting
- `src/hooks/useAuth.ts` — dual auth pattern
- `database/supabase-schema.sql` — full DB schema
