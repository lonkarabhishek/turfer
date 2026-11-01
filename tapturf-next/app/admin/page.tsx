import type { Metadata } from "next";
import Link from "next/link";
import { isAdmin } from "@/lib/admin/auth";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminSection } from "@/components/admin/AdminSection";
import {
  ActivitySection,
  BookingsSection,
  BreakdownsSection,
  ContactsSection,
  DailyGamesSection,
  GamesListSection,
  HeadlineSection,
  LoginsSection,
  ReviewsSection,
  SignupWindowsSection,
  SignupsSection,
  ToolsSection,
  TopHostsSection,
  TournamentsSection,
  activitySummary,
  bookingsSummary,
  breakdownsSummary,
  claimsSummary,
  contactsSummary,
  dailyGamesSummary,
  gamesListSummary,
  headlineSummary,
  linkRefusalsSummary,
  loginsSummary,
  reviewsSummary,
  signupWindowsSummary,
  signupsSummary,
  toolsSummary,
  topHostsSummary,
  tournamentsSummary,
} from "@/components/admin/HomeSections";
import { AtAGlance } from "@/components/admin/Glance";
import { Fold } from "@/components/admin/Fold";
import { CoverPhotoTool } from "@/components/admin/CoverPhotoTool";
import { ListingCheckTool, ReviewSummaryTool } from "@/components/admin/AiTools";
import { LinkRefusals } from "@/components/admin/LinkRefusals";
import { OwnerClaims } from "@/components/admin/OwnerClaims";
import { OwnerPhotos } from "@/components/admin/OwnerPhotos";

// Never cache. Always fresh numbers for the owner.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Admin · TapTurf",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The owner's dashboard, laid out for a phone first: the numbers at a
 * glance, then the people who signed up and what each did, then every
 * other section folded to one summary row (components/admin/Fold.tsx),
 * those waiting for the owner first and open. The page itself only checks
 * it's the owner; every section reads its own numbers and streams in when
 * they arrive (components/admin/HomeSections.tsx). A read that fails or is
 * slow shows "-" and a retry in its own section, and the rest of the page
 * loads as usual: on 27 Oct one timed-out read threw the whole page away.
 */
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ person?: string | string[]; people?: string | string[] }> }) {
  // Owner-only guard. Non-admins end on a "Page not found" screen;
  // AdminGate first lets a phone-OTP owner hand over their Firebase token.
  // Also the render's one session refresh (lib/admin/auth.ts).
  const allowed = await isAdmin();
  if (!allowed) return <AdminGate />;
  const sp = await searchParams;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 md:py-12">
      {/* Header: the buttons share the first line with "Owner only", so the numbers start higher on a phone. */}
      <div className="mb-4 md:mb-8">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-accent-600">Owner only</p>
          <div className="flex items-center gap-2">
            <Link href="/admin" className="inline-flex h-10 items-center rounded-full bg-primary-900 text-white text-[13px] font-bold px-3.5 sm:px-4 hover:bg-primary-800">
              Refresh
            </Link>
            <Link href="/" className="inline-flex h-10 items-center rounded-full border border-primary-200 text-primary-800 text-[13px] font-bold px-3.5 sm:px-4 hover:bg-primary-50">
              Back to site
            </Link>
          </div>
        </div>
        <h1 className="mt-1 md:mt-2 font-display tracking-tight text-primary-900 text-3xl md:text-5xl leading-none">TapTurf Admin</h1>
        <p className="text-primary-500 text-[12px] md:text-sm mt-1.5 md:mt-2">
          Real numbers, refreshed on every load. For deeper session / pageview analytics see{" "}
          <a href="https://analytics.google.com" target="_blank" rel="noopener noreferrer" className="text-accent-600 underline hover:text-accent-700">
            Google Analytics
          </a>
          .
        </p>
      </div>

      {/* Sign-ups today, this week and this month; turfs claimed; what waits for the owner. */}
      <AtAGlance />

      {/* The people who signed up and what each did, open: the chart above the list folds away (SignupsTrend). */}
      <AdminSection id="signups" title="Users and what they did" height={420} summary={signupsSummary} open>
        <SignupsSection person={sp.person} people={sp.people} />
      </AdminSection>

      {/* Waiting for the owner first; each opens by itself when something waits. */}
      {/* myTapturf claims (read in the browser, after the page); /admin/claimed links here (#owner-claims) for the actions. */}
      <AdminSection id="owner-claims" title="myTapturf owners" summary={claimsSummary}>
        <p className="text-[13px] text-primary-500 mb-3">Owners whose number is on the listing get in at once; approve the rest here.</p>
        <OwnerClaims />
      </AdminSection>

      {/* myTapturf owner photos (read in the browser: the panel fills in the line and how many are kept off). */}
      <Fold id="owner-photos" title="Owner photos" line="Photos owners add on myTapturf, checked automatically">
        <p className="text-[13px] text-primary-500 mb-3">
          Photos owners add go live at once and are checked automatically; anything that isn&rsquo;t the venue is kept off the page until you put it back.
        </p>
        <OwnerPhotos />
      </Fold>

      {/* Signup windows, the tick, Ask and the suggestions queue (requests + notifications are in the reviews snapshot to keep the layout de-duped). */}
      <AdminSection id="signup-windows" title="Sign-ups, ticks, Ask and suggestions" height={280} summary={signupWindowsSummary}>
        <SignupWindowsSection />
      </AdminSection>

      {/* Reviews + notifications snapshot, with the owners' removal requests waiting. */}
      <AdminSection id="reviews" title="Reviews & notifications" height={160} summary={reviewsSummary}>
        <ReviewsSection />
      </AdminSection>

      {/* What couldn't be added to an account, for the owner to follow up by hand (no row at all when there is none). */}
      <AdminSection id="link-refusals" title="What couldn't be added" height={0} summary={linkRefusalsSummary}>
        <LinkRefusals />
      </AdminSection>

      {/* Turf contact taps: how many players reached out to turfs. */}
      <AdminSection id="contacts" title="Turf contacts" height={320} summary={contactsSummary}>
        <ContactsSection />
      </AdminSection>

      {/* Top-line tiles */}
      <AdminSection id="headline" title="People, games and turfs" height={140} summary={headlineSummary}>
        <HeadlineSection />
      </AdminSection>

      {/* Sign-ins */}
      <AdminSection id="sign-ins" title="Sign-ins" height={140} summary={loginsSummary}>
        <LoginsSection />
      </AdminSection>

      {/* The free tools: live scoreboard links, and uses counted since 26 Oct 2026 (lib/tools/usage.ts). */}
      <AdminSection id="tools" title="Tools" height={140} summary={toolsSummary}>
        <ToolsSection />
      </AdminSection>

      {/* Live tournaments (/tournament/<code>): how many, matches being scored live now, views; the list is /admin/tournaments. */}
      <AdminSection id="tournaments" title="Tournaments" height={140} summary={tournamentsSummary}>
        <TournamentsSection />
      </AdminSection>

      {/* AI tools (each reads its progress in the browser, once the page is idle). */}
      <Fold id="ai-tools" title="AI tools" line="Cover photos by Claude, what players say, listing checker">
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CoverPhotoTool />
          <ReviewSummaryTool />
          <ListingCheckTool />
        </section>
      </Fold>

      {/* Charts */}
      <AdminSection id="games-created" title="Games created" height={220} summary={dailyGamesSummary}>
        <DailyGamesSection />
      </AdminSection>

      {/* Activity tiles */}
      <AdminSection id="activity" title="Activity" height={140} summary={activitySummary}>
        <ActivitySection />
      </AdminSection>

      {/* Bookings + monetisation: zeroes today, they come alive as bookings and reviews start flowing. */}
      <AdminSection id="bookings" title="Bookings & revenue" height={160} summary={bookingsSummary}>
        <BookingsSection />
      </AdminSection>

      {/* Games: upcoming / live first, then the latest past games. */}
      <AdminSection id="games" title="Games" height={320} summary={gamesListSummary}>
        <GamesListSection />
      </AdminSection>

      <AdminSection id="breakdowns" title="Breakdowns" height={240} summary={breakdownsSummary}>
        <BreakdownsSection />
      </AdminSection>

      {/* Top hosts (the people who signed up are in the Sign-ups section) */}
      <AdminSection id="top-hosts" title="Top hosts" height={200} summary={topHostsSummary}>
        <TopHostsSection />
      </AdminSection>

      <footer className="text-xs text-primary-400 text-center mt-10 pb-8 space-y-1">
        <p>Owner-only view. Not indexed. Not linked from anywhere.</p>
      </footer>
    </div>
  );
}
