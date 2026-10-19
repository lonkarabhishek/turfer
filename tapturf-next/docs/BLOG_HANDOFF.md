# Handoff: adding gym and fitness posts to the TapTurf blog

For the agent writing gym and fitness news and guides on tapturf.in. Read this whole page once before the first commit.

## 1. Where the code lives

- Repo: `https://github.com/lonkarabhishek/turfer`
- The live site is the Next.js 16 app in **`tapturf-next/`**. Run every command from there.
- The repo root (`../src/`, `../database/`) is the old Vite app. Do not touch it.
- Hosting: Vercel, with root directory `tapturf-next`.
  - Pushing **`main`** deploys production (`https://www.tapturf.in`) in about 2 minutes.
  - Pushing any other branch builds a preview URL only.
  - If a build fails, production keeps serving the last good deploy.

## 2. How to push

Another agent also merges into `main`, on branch `claude/local-setup-67g3z1`. To stay out of each other's way:

```bash
git clone https://github.com/lonkarabhishek/turfer && cd turfer/tapturf-next
git checkout -b content/gym-<topic> origin/main   # one branch per batch
# ...write posts, run the checks in section 6...
git push -u origin content/gym-<topic>          # preview build; open it and read the post
git fetch origin main && git rebase origin/main  # pick up anything merged meanwhile
git push origin HEAD:main                        # production
```

- **Never force-push `main`.** If the push is rejected, run `git pull --rebase origin main` and push again.
- Batch the work. Put one or a few posts in each commit, and merge into `main` once per batch, not after every typo fix.
- Only touch the files listed in section 3. If something outside them needs to change, ask the owner first.

## 3. Files you will touch

| What | Where |
|---|---|
| One file per post | `content/blog/posts/<slug>.ts` |
| Register the post | `content/blog/index.ts`: add an import and put it at the top of `ALL_POSTS` |
| Post and block types | `content/blog/types.ts` |
| Hero art | `public/blog/art/<name>.svg` plus a `<name>.png` twin at 1200x675 |

What happens automatically, with no other file to edit:

- The sitemap (`app/sitemap.ts`) lists every post in `ALL_POSTS`, with `lastModified` set to `updatedAt`, or `publishedAt` if there is no update.
- `/blog` lists every post, newest `publishedAt` first.
- Each post page emits BlogPosting and BreadcrumbList JSON-LD. It also emits FAQPage JSON-LD when the post has a `faq` block.
- Related posts at the bottom of an article prefer the same city, then the same `category`.
- Sport pages (`/sport/<slug>`) list posts whose **slug contains the sport slug**. For example, a post at `gym-workouts-for-football-players` also shows on `/sport/football`, and `strength-training-for-box-cricket` shows on `/sport/box-cricket`. Use this on purpose: it is free internal linking.
  - Sport slugs: football, box-cricket, cricket, badminton, pickleball, volleyball, basketball, tennis, table-tennis, padel, ultimate-frisbee, swimming.

Post pages are fully static (`dynamicParams = false`), so **a post only goes live when it is pushed to `main`**. There is no CMS.

### First commit: add the categories

`PostCategory` in `content/blog/types.ts` is a closed union. Add the two new values as a one-line change in your first commit:

```ts
export type PostCategory =
  | "Best Turfs" | "Guides" | "Rules" | "Playbook"
  | "Fitness"   // evergreen gym and training guides
  | "News"      // dated news with sources
  | "Nashik" | "Pune" | "Mumbai" | "Nagpur" | "Hyderabad";
```

Use those two exact strings so the chips on `/blog` stay consistent. In the same commit, optionally widen the subtitle in `app/blog/page.tsx` ("for anyone who plays cricket, football or box cricket on a turf in India") so it covers fitness too.

## 4. Post template

```ts
import type { Post } from "../types";

export const post: Post = {
  slug: "gym-workouts-for-football-players",           // lowercase, hyphens, no dates unless it is news
  title: "Gym Workouts for Football Players: 3 Days a Week That Help on the Turf",
  description: "150 to 160 characters. Says exactly what the reader gets. Used as meta description and card subtitle.",
  hook: "One punchy line for the listing card.",
  category: "Fitness",                                   // or "News"
  city: null,                                            // a city id like "pune" only if the post is truly local
  readMinutes: 7,
  publishedAt: "2026-10-20",                             // YYYY-MM-DD, the real date
  // updatedAt: "2026-11-02",                            // set whenever you materially edit a post
  coverEmoji: "🏋️",
  heroImage: {
    url: "/blog/art/gym-football.svg",
    og: "https://www.tapturf.in/blog/art/gym-football.png", // PNG for WhatsApp/X/LinkedIn cards, absolute URL
    alt: "Describe the image for someone who cannot see it",
  },
  keywords: ["gym workout for football players", "football strength training", "..."],
  cta: { href: "/turfs", label: "Find a turf to play this week" },
  blocks: [
    { type: "p", text: "Answer the headline question in the first two sentences. ..." },
    { type: "h2", text: "How many days a week should a footballer lift?" },
    { type: "p", text: "..." },
    { type: "ul", items: ["...", "..."] },
    { type: "callout", title: "Before you start", text: "..." },
    { type: "table", caption: "...", columns: ["Day", "Focus", "Main lift"], rows: [["Mon", "Lower body", "Squat"]] },
    { type: "cta", text: "Put it to use on a real pitch.", href: "/sport/football", label: "Football turfs near you" },
    { type: "faq", items: [{ q: "Is it okay to lift the day before a match?", a: "..." }] },
  ],
};
```

All block types (`p`, `h2`, `h3`, `ul`, `ol`, `quote`, `callout`, `cta`, `stat-grid`, `table`, `faq`, `image`, `turf`, `related-turfs`, `price-calc`) are defined and documented in `content/blog/types.ts`. Copy the shape of an existing post such as `content/blog/posts/how-to-win-at-box-cricket.ts` if you are unsure.

### Hero art

- Draw the art as a 1200x675 SVG. Keep it vector, with no stock photos you do not have rights to.
- Export a PNG twin of the same size. One way: open the SVG in Chromium with Playwright and take a screenshot.
- Put both files in `public/blog/art/`.
- Social cards cannot show SVG, which is why `og` points to the PNG.

## 5. Rules for content

**Hard rules.** A post that breaks any of these does not ship.

1. **Never invent facts.** That means no made-up studies, statistics, quotes, prices, gym names, openings, events or people. Every number needs a source you actually read. If you cannot source a claim, cut it.
2. **Every news post cites its sources.** End with an `h2` "Sources" followed by a `sources` block, which renders clickable links: `{ type: "sources", items: [{ label: "Pudhari, 7 October 2026", url: "https://..." }], note: "optional line" }`. Give the publication name and date in each label. Only cover events that actually happened, with the real date. If you are rewriting a report, summarise it in your own words and link to it. Do not copy paragraphs.
3. **Health content is YMYL (Your Money or Your Life).** Google holds it to a higher bar.
   - No medical, injury-treatment or supplement-dosage advice beyond plain, widely accepted guidance. Prefer guidance from WHO, ICMR, NHS or a sports body.
   - End every training post with a line like: "This is general information, not medical advice. Check with a doctor or a qualified coach before starting a new programme, especially after an injury."
4. **TapTurf does not list gyms.** It lists turfs, courts and pickup games in 54 Indian cities. Do not say or imply that people can find, book or compare gyms on TapTurf. Do not link to `/sport/gym`, because that page does not exist.
5. **No em dashes (—) anywhere** in titles, copy or alt text. Use commas, colons or full stops. Write in Indian English (programme, metre, ₹, lakh).
6. **No hype or filler.** Avoid "ultimate", "game-changer", "unlock" and emoji in the body. Write plainly, the way a good coach talks.

**Angle that fits the site.** TapTurf readers play football, box cricket, badminton, pickleball and other sports on turfs and courts, so write fitness *for players*. For example:

- Gym and strength work for footballers, cricketers or badminton players.
- Warm-ups before a turf game.
- Recovery after a weekend match.
- Fitness tests that matter for amateur players.
- How to train for your first 5-a-side tournament.
- Yoga or mobility for players.
- Monsoon indoor fitness.
- Explainers on fitness rules and events in India, sourced and dated, such as sports and fitness news from the government, the Fit India movement, or federation fitness standards.

Then link the reader on to the sport pages, `/turfs`, `/games` and `/tools`.

## 6. SEO and AEO checklist (every post)

- [ ] The title targets one real search query and stays under 65 characters if you can manage it.
- [ ] The first paragraph answers the question directly in one or two sentences. Answer engines quote this part.
- [ ] The H2s are phrased as the questions people actually type ("How often should I…", "What should I eat before…").
- [ ] The post ends with a `faq` block of 3 to 6 questions with short, self-contained answers. This is what produces FAQPage schema.
- [ ] It links to at least 2 internal pages (`/sport/<slug>`, `/turfs`, `/games`, `/tools`, a city page like `/pune`, or another post), plus the `cta`.
- [ ] `publishedAt` is today's date. `updatedAt` is set whenever you revise the post. Refreshing old posts with real updates is the cheapest way to keep the site looking live.
- [ ] `description` is 150 to 160 characters and unique.
- [ ] The slug is short, stable and descriptive. Never rename a published slug, because that breaks inbound links.
- [ ] News posts list their sources.
- [ ] `heroImage.alt` describes the image.

**Cadence:** two or three posts a week beats ten in one day. Mix evergreen Fitness pieces with dated News.

## 7. Checks before pushing

From `tapturf-next/`:

```bash
npm ci
npm run check:blog             # the same guard Vercel runs before every build: ERROR stops the deploy, warn is a style note
npx tsc --noEmit -p .          # catches a wrong block shape or category typo
npx eslint content/blog        # lint what you touched
grep -rn "—" content/blog/posts/<your-files>   # must print nothing
npx next build                 # optional locally: needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local
```

If you cannot build locally, push your branch and use the Vercel preview as the build check. Open `/blog`, your post, and the matching `/sport/...` page on the preview before merging.

Also check the live result after it ships:

- `https://www.tapturf.in/blog/<slug>` loads.
- `https://www.tapturf.in/sitemap.xml` lists it.
- Pasting the URL into WhatsApp shows the PNG card.

## 8. Do not touch

- `proxy.ts`, `lib/cityRouting.ts`, `lib/cityPrePaint.ts`, `app/c/**`: city personalisation.
- `lib/ai/**`, `app/api/**`: Ask TapTurf and the admin AI tools.
- Supabase: tables, columns, RLS policies, migrations. Never rename or drop anything.
- Secrets: never commit `.env*` and never put a key in a `NEXT_PUBLIC_` variable. `ANTHROPIC_API_KEY` and the Supabase service role key live only in Vercel env settings.
- Generated output: do not commit `.next/`, `.test-out/`, `node_modules/` or `__pycache__/`.
- `content/blog/data/turfs.ts`: real venue snapshot rows. Only add a row after querying the real database, never by hand.

## 9. Who to ask

The site owner (Abhishek, info@tapturf.in) approves anything outside this page: new block types, layout changes, new routes, or a gym listings product.
