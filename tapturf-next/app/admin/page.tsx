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
} from "@/components/admin/HomeSections";
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
 * The owner's dashboard. The page itself only checks it's the owner; every
 * section reads its own numbers and streams in when they arrive
 * (components/admin/HomeSections.tsx). A read that fails or is slow shows
 * "-" and a retry in its own section, and the rest of the page loads as
 * usual: on 27 Oct one timed-out read threw the whole page away.
 */
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ person?: string | string[]; people?: string | string[] }> }) {
  // Owner-only guard. Non-admins end on a "Page not found" screen;
  // AdminGate first lets a phone-OTP owner hand over their Firebase token.
  // Also the render's one session refresh (lib/admin/auth.ts).
  const allowed = await isAdmin();
  if (!allowed) return <AdminGate />;
  const sp = await searchParams;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 md:py-12">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs font-bold text-accent-600 mb-2">Owner only</p>
          <h1 className="font-display tracking-tight text-primary-900 text-4xl md:text-5xl leading-none">TapTurf Admin</h1>
          <p className="text-primary-500 text-sm mt-2">
            Real numbers, refreshed on every load. For deeper session / pageview analytics see{" "}
            <a href="https://analytics.google.com" target="_blank" rel="noopener noreferrer" className="text-accent-600 underline hover:text-accent-700">
              Google Analytics
            </a>
            .
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin" className="rounded-full bg-primary-900 text-white text-xs font-bold px-4 py-2 hover:bg-primary-800">
            Refresh
          </Link>
          <Link href="/" className="rounded-full border border-primary-200 text-primary-800 text-xs font-bold px-4 py-2 hover:bg-primary-50">
            Back to site
          </Link>
        </div>
      </div>

      {/* Turf contact taps, first: how many players reached out to turfs. */}
      <AdminSection title="Turf contacts" height={320}>
        <ContactsSection />
      </AdminSection>

      {/* Top-line tiles */}
      <AdminSection title="People, games and turfs" height={140}>
        <HeadlineSection />
      </AdminSection>

      {/* Sign-ins */}
      <AdminSection title="Sign-ins" height={140}>
        <LoginsSection />
      </AdminSection>

      {/* The free tools: live scoreboard links, and uses counted since 26 Oct 2026 (lib/tools/usage.ts). */}
      <AdminSection title="Tools" height={140}>
        <ToolsSection />
      </AdminSection>

      {/* Signup windows (requests + notifications are further down in the reviews snapshot to keep the layout de-duped). */}
      <AdminSection title="Sign-ups, ticks, Ask and suggestions" height={280}>
        <SignupWindowsSection />
      </AdminSection>

      {/* myTapturf claims (read in the browser, after the page) */}
      <section className="mb-8 rounded-2xl bg-white border border-primary-200 p-5">
        <h2 className="font-semibold text-primary-900 mb-1">myTapturf owners</h2>
        <p className="text-[13px] text-primary-500 mb-4">Owners whose number is on the listing get in at once; approve the rest here.</p>
        <OwnerClaims />
      </section>

      {/* myTapturf owner photos */}
      <section className="mb-8 rounded-2xl bg-white border border-primary-200 p-5">
        <h2 className="font-semibold text-primary-900 mb-1">Owner photos</h2>
        <p className="text-[13px] text-primary-500 mb-4">
          Photos owners add go live at once and are checked automatically; anything that isn&rsquo;t the venue is kept off the page until you put it back.
        </p>
        <OwnerPhotos />
      </section>

      {/* AI tools */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <CoverPhotoTool />
        <ReviewSummaryTool />
        <ListingCheckTool />
      </section>

      {/* Charts */}
      <AdminSection title="Sign-ups" height={420}>
        <SignupsSection person={sp.person} people={sp.people} />
      </AdminSection>
      {/* What couldn't be added to an account, for the owner to follow up by hand. */}
      <AdminSection title="What couldn't be added" height={0}>
        <LinkRefusals />
      </AdminSection>
      <AdminSection title="Games created" height={220}>
        <DailyGamesSection />
      </AdminSection>

      {/* Activity tiles */}
      <AdminSection title="Activity" height={140}>
        <ActivitySection />
      </AdminSection>

      {/* Bookings + monetisation: zeroes today, they come alive as bookings and reviews start flowing. */}
      <AdminSection title="Bookings & revenue" height={160}>
        <BookingsSection />
      </AdminSection>

      {/* Reviews + notifications snapshot */}
      <AdminSection title="Reviews & notifications" height={160}>
        <ReviewsSection />
      </AdminSection>

      {/* Games: upcoming / live first, then the latest past games. */}
      <AdminSection title="Games" height={320}>
        <GamesListSection />
      </AdminSection>

      <AdminSection title="Breakdowns" height={240}>
        <BreakdownsSection />
      </AdminSection>

      {/* Top hosts (the people who signed up are in the Sign-ups section) */}
      <AdminSection title="Top hosts" height={200}>
        <TopHostsSection />
      </AdminSection>

      <footer className="text-xs text-primary-400 text-center mt-10 pb-8 space-y-1">
        <p>Owner-only view. Not indexed. Not linked from anywhere.</p>
      </footer>
    </div>
  );
}
