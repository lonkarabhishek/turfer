import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { activeTurfCount, claimedTurfCount } from "@/lib/queries/admin";
import { reviewFlagNumbers, reviewRemovalNumbers } from "@/lib/queries/adminReviews";
import { signupPeople } from "@/lib/queries/adminUsers";
import { claimCounts } from "@/lib/admin/claimed";
import { claimedThisWeek, deltaText, signupGlance, type GlanceCount } from "@/lib/admin/glance";
import { reasonText } from "@/lib/admin/section";
import { adminClaims, pendingSuggestions } from "./HomeSections";
import { SectionBoundary } from "./SectionStatus";
import { MapGlance } from "./MapUsage";

/**
 * The top of the admin home, sized for a phone: sign-ups today, in 7 and in
 * 30 days (as the sign-ups chart counts them, each against the stretch
 * before), turfs claimed (now, new this week, claims waiting), and what
 * waits for the owner, each a tap from where it is decided. Every number is
 * one the admin already reads (the same cached reads as the sections
 * below); a read that fails shows "-".
 */

const DASH = "-";
const fmt = (n: number) => n.toLocaleString("en-IN");
const readTime = () => Date.now();

export function AtAGlance() {
  return (
    <section aria-label="At a glance" className="mb-5 grid gap-3 md:grid-cols-2">
      <SectionBoundary title="Sign-ups at a glance">
        <Suspense fallback={<CardLoading title="Sign-ups" />}>
          <SignupsCard />
        </Suspense>
      </SectionBoundary>
      <SectionBoundary title="Turfs claimed at a glance">
        <Suspense fallback={<CardLoading title="Turfs claimed" />}>
          <TurfsCard />
        </Suspense>
      </SectionBoundary>
      <div className="md:col-span-2">
        <SectionBoundary title="What's waiting">
          <Suspense fallback={null}>
            <WaitingRow />
          </Suspense>
        </SectionBoundary>
      </div>
      {/* How many use the map (components/admin/MapUsage.tsx); nothing before it is counted. */}
      <div className="md:col-span-2 empty:hidden">
        <SectionBoundary title="The map at a glance">
          <Suspense fallback={null}>
            <MapGlance />
          </Suspense>
        </SectionBoundary>
      </div>
    </section>
  );
}

function Card({ title, link, children }: { title: string; link?: { href: string; label: string }; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-primary-200 bg-white p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-bold text-primary-500">{title}</h2>
        {link && (
          <To href={link.href} className="-my-2 -mr-1 inline-flex min-h-10 items-center gap-0.5 rounded-full px-2 text-[13px] font-semibold text-accent-700 hover:text-accent-800 focus-neon">
            {link.label}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </To>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">{children}</div>
    </div>
  );
}

function CardLoading({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-primary-100 bg-primary-50/60 p-3 sm:p-4 animate-pulse" aria-busy="true">
      <p className="mb-2 text-[13px] font-bold text-primary-400">{title}</p>
      <div className="h-[84px]" />
    </div>
  );
}

/** One number: its label, the number, and a second line (the change, or what it is out of). */
function Mini({ label, value, sub, delta, href, hot = false }: { label: string; value: string; sub?: string; delta?: string | null; href?: string; hot?: boolean }) {
  const inner = (
    <>
      <span className={`block text-[12px] font-semibold leading-tight ${hot ? "text-amber-900" : "text-primary-500"}`}>{label}</span>
      <span className={`mt-1 block font-display text-[28px] leading-none tabular-nums ${hot ? "text-amber-950" : "text-primary-900"}`}>{value}</span>
      {(delta || sub) && (
        <span className={`mt-1.5 block text-[11px] leading-tight ${hot ? "text-amber-900" : "text-primary-500"}`}>
          {delta && <span className={`font-bold ${delta.startsWith("+") ? "text-accent-700" : delta.startsWith("−") ? "text-hot-600" : "text-primary-700"}`}>{delta} </span>}
          {sub}
        </span>
      )}
    </>
  );
  const cls = `block min-h-[84px] min-w-0 rounded-xl px-2.5 py-2 ${hot ? "bg-amber-100" : "bg-primary-50"}`;
  if (!href) return <div className={cls}>{inner}</div>;
  return (
    <To href={href} className={`${cls} transition-colors ${hot ? "hover:bg-amber-200" : "hover:bg-primary-100"} focus-neon`}>
      {inner}
    </To>
  );
}

/**
 * A link: a plain anchor for a place on this page (#owner-claims), so the
 * browser's own jump (and its hashchange) opens the fold it is in
 * (components/admin/Fold.tsx); next/link for another page.
 */
function To({ href, className, label, children }: { href: string; className: string; label?: string; children: ReactNode }) {
  if (href.startsWith("#")) {
    return (
      <a href={href} aria-label={label} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} aria-label={label} className={className}>
      {children}
    </Link>
  );
}

async function SignupsCard() {
  const { people, readAt } = await signupPeople();
  const g = people ? signupGlance(people.map((p) => p.joinedAt).sort((a, b) => a - b), readAt) : null;
  const tile = (label: string, c: GlanceCount | undefined, vs: string) => (
    <Mini label={label} value={c ? fmt(c.total) : DASH} delta={c ? deltaText(c) : null} sub={c ? (c.previous === null ? undefined : vs) : "Couldn't load"} />
  );
  return (
    <Card title="Sign-ups" link={{ href: "#people", label: "People" }}>
      {tile("Today", g?.today, "vs yesterday")}
      {tile("7 days", g?.week, "vs 7 days before")}
      {tile("30 days", g?.month, "vs 30 days before")}
    </Card>
  );
}

async function TurfsCard() {
  const [claimed, turfs, claims] = await Promise.all([claimedTurfCount(), activeTurfCount(), adminClaims()]);
  const c = claims.ok ? claimCounts(claims.data.claims) : null;
  const fresh = claims.ok ? claimedThisWeek(claims.data.claims, readTime()) : null;
  return (
    <Card title="Turfs claimed" link={{ href: "/admin/claimed", label: "All claims" }}>
      <Mini
        label="Claimed"
        href="/admin/claimed"
        value={claimed.ok ? fmt(claimed.data) : DASH}
        sub={claimed.ok ? (turfs.ok ? `of ${fmt(turfs.data)} active` : "on myTapturf") : reasonText(claimed.reason)}
      />
      <Mini label="This week" href="/admin/claimed" value={fresh === null ? DASH : `+${fmt(fresh)}`} sub={claims.ok ? "newly claimed" : reasonText(claims.reason)} />
      <Mini
        label="Waiting"
        href="#owner-claims"
        hot={!!c && c.waiting > 0}
        value={c ? fmt(c.waiting) : DASH}
        sub={claims.ok ? (c?.waiting ? "to approve" : "none to approve") : reasonText(claims.reason)}
      />
    </Card>
  );
}

/** What waits for the owner, each linking to where it is decided. */
async function WaitingRow() {
  const [claims, suggestions, removals, flags] = await Promise.all([adminClaims(), pendingSuggestions(), reviewRemovalNumbers(), reviewFlagNumbers()]);
  // Removal requests and reported reviews: none to show on a database from before them.
  // Short words on the chips, so three fit a line on a phone; screen readers hear what each is after them.
  const items: { n: number | null; one: string; many: string; what: string; href: string }[] = [
    { n: claims.ok ? claimCounts(claims.data.claims).waiting : null, one: "claim", many: "claims", what: "owner claims to approve", href: "#owner-claims" },
    { n: suggestions.ok ? suggestions.rows.length : suggestions.reason === "not_set_up" ? 0 : null, one: "suggestion", many: "suggestions", what: "player suggestions to approve", href: "/admin/suggestions" },
    { n: removals.ok ? removals.data.open : removals.reason === "not_set_up" ? 0 : null, one: "review removal", many: "review removals", what: "review removal requests", href: "/admin/reviews#removal-requests" },
    { n: flags.ok ? flags.data.open : flags.reason === "not_set_up" ? 0 : null, one: "reported review", many: "reported reviews", what: "reviews players reported", href: "#review-reports" },
  ];
  const waiting = items.filter((i) => i.n !== null && i.n > 0);
  const unknown = items.filter((i) => i.n === null);
  const chip = "inline-flex min-h-11 items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-center text-[12px] leading-tight focus-neon sm:min-h-10 sm:rounded-full sm:px-3 sm:text-[13px]";
  return (
    <div className="rounded-2xl border border-primary-200 bg-white p-3 sm:flex sm:items-center sm:gap-3 sm:px-4 sm:py-2">
      <h2 className="mb-2 text-[13px] font-bold text-primary-500 sm:mb-0 sm:shrink-0">Waiting for you</h2>
      {waiting.length === 0 && unknown.length === 0 ? (
        <p className="text-[13px] text-primary-600 sm:py-2.5">Nothing right now</p>
      ) : (
        // Three to a line on a phone, the words wrapping inside each; one row from a tablet up.
        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
          {waiting.map((i) => (
            <To key={i.href} href={i.href} label={`${fmt(i.n ?? 0)} ${i.n === 1 ? i.one : i.many}: ${i.what}`} className={`${chip} bg-amber-100 font-semibold text-amber-900 hover:bg-amber-200`}>
              {fmt(i.n ?? 0)} {i.n === 1 ? i.one : i.many}
              <ChevronRight className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
            </To>
          ))}
          {unknown.map((i) => (
            <To key={i.href} href={i.href} label={`${DASH} ${i.many}: ${i.what}, couldn't load`} className={`${chip} border border-primary-200 text-primary-600 hover:bg-primary-50`}>
              {DASH} {i.many}
            </To>
          ))}
        </div>
      )}
    </div>
  );
}
