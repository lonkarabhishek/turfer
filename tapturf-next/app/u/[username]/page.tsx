import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { VerifiedTick } from "@/components/account/VerifiedTick";
import { UserAvatar } from "@/components/account/UserAvatar";
import { OwnerVerifyNote } from "@/components/account/OwnerVerifyNote";
import { MedalTile, PassportNumbers, ReviewedList } from "@/components/profile/PassportParts";
import { loadPublicPassport } from "@/lib/profile/publicProfile";

// A TapTurf player's public profile: username, name, photo, join month
// and the verified tick (a number and an email both confirmed; never
// which one is missing), then what they can flaunt: how many games,
// turfs, cities and sports, their best weekly streak, the medals they
// earned and the turfs they reviewed (lib/profile/passport.ts
// publicPassport: counts only, never where or when they played, or who
// with). Tags on live scorecards link here. Only for people
// who left "Let others find and tag me" on; an old username 308s to the
// current one. Kept out of search engines and the sitemap.

// A minute: someone who turns tagging off disappears from here that soon.
export const revalidate = 60;

export function generateStaticParams() {
  return [];
}

type Profile = { u: string; name: string; photo: string | null; since: string | null; verified: boolean };
type Found = { profile: Profile } | { movedTo: string } | null;

/** Throws when the database cannot be read, so an outage is never cached as "no such player". */
const loadProfile = cache(async (raw: string): Promise<Found> => {
  if (!/^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(raw)) return null;
  const { data, error } = await createReadOnlyClient().rpc("profile_get", { p_username: raw.toLowerCase() });
  if (error) throw new Error(`profile_get failed: ${error.message}`);
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.moved_to === "string") return { movedTo: d.moved_to };
  if (typeof d.u !== "string" || typeof d.name !== "string") return null;
  return {
    profile: {
      u: d.u,
      name: d.name,
      photo: typeof d.photo === "string" ? d.photo : null,
      since: typeof d.since === "string" ? d.since : null,
      verified: d.verified === true,
    },
  };
});

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const found = await loadProfile(decodeURIComponent(username));
  const robots = { index: false, follow: true };
  if (!found || !("profile" in found)) return { title: "Player not found", robots };
  const { u, name } = found.profile;
  return {
    title: `${name} (@${u})`,
    description: `${name} plays on TapTurf.`,
    robots,
    alternates: { canonical: `https://www.tapturf.in/u/${u}` },
  };
}

function sinceText(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
}

export default async function PlayerProfilePage({ params }: Props) {
  const { username } = await params;
  const raw = decodeURIComponent(username);
  const found = await loadProfile(raw);
  if (!found) notFound();
  if ("movedTo" in found) permanentRedirect(`/u/${found.movedTo}`);
  const { u, name, photo, since, verified } = found.profile;
  if (raw !== u) permanentRedirect(`/u/${u}`);
  const month = sinceText(since);
  const passport = await loadPublicPassport(u);
  const counts = passport?.numbers;
  const played = !!counts && (counts.games > 0 || counts.reviews > 0);

  return (
    <div className="max-w-md mx-auto px-4 py-12 sm:py-16">
      <div className="bg-white rounded-2xl shadow-elevated px-6 py-8 text-center">
        <UserAvatar src={photo} name={name} size={96} eager className="mx-auto ring-4 ring-accent-50" />
        <h1 className="mt-4 font-display text-3xl text-primary-900 leading-tight break-words">
          {name}
          {verified && <VerifiedTick size="lg" className="ml-1.5 align-[-0.1em]" />}
        </h1>
        <p className="mt-1 text-[15px] text-primary-500">@{u}</p>
        {verified && <p className="mt-1 text-[13px] font-medium text-sky-700">Verified · Phone and email confirmed</p>}
        {month && <p className="mt-3 text-[13px] text-primary-500">On TapTurf since {month}</p>}
      </div>

      {passport && played && counts && (
        <>
          <section aria-labelledby="u-numbers" className="mt-8">
            <h2 id="u-numbers" className="mb-3 font-display text-[20px] font-semibold text-primary-900">
              On TapTurf
            </h2>
            <PassportNumbers
              cols={3}
              label={`${name}'s numbers`}
              items={[
                { label: counts.games === 1 ? "Game" : "Games", value: counts.games },
                { label: counts.turfs === 1 ? "Turf" : "Turfs", value: counts.turfs },
                { label: counts.cities === 1 ? "City" : "Cities", value: counts.cities },
                { label: counts.sports === 1 ? "Sport" : "Sports", value: counts.sports },
                { label: "Hosted", value: counts.hosted },
                { label: counts.reviews === 1 ? "Review" : "Reviews", value: counts.reviews },
              ]}
            />
            {counts.bestStreak >= 2 && (
              <p className="mt-3 text-center text-[14px] text-primary-600">
                Best streak: <span className="font-semibold text-primary-900">{counts.bestStreak} weeks</span> in a row
              </p>
            )}
          </section>

          {passport.medals.length > 0 && (
            <section aria-labelledby="u-medals" className="mt-8">
              <h2 id="u-medals" className="mb-3 font-display text-[20px] font-semibold text-primary-900">
                Medals
              </h2>
              <ul className="grid grid-cols-3 gap-2">
                {passport.medals.map((m) => (
                  <li key={m.id}>
                    <MedalTile art={m.art} name={m.name} line={m.blurb} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {passport.reviewed.length > 0 && (
            <section aria-labelledby="u-reviewed" className="mt-8">
              <h2 id="u-reviewed" className="mb-3 font-display text-[20px] font-semibold text-primary-900">
                Turfs {name.split(" ")[0]} reviewed
              </h2>
              <ReviewedList items={passport.reviewed} />
            </section>
          )}
        </>
      )}

      <OwnerVerifyNote username={u} />

      <div className="mt-6 text-center space-y-3">
        <p className="text-[14px] text-primary-600">Find a turf near you and get a game going.</p>
        <Link
          href="/turfs"
          className="inline-flex h-11 items-center rounded-full bg-primary-900 px-6 text-[15px] font-semibold text-white"
        >
          Browse turfs
        </Link>
      </div>
    </div>
  );
}
