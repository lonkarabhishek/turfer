import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { VerifiedTick } from "@/components/account/VerifiedTick";
import { UserAvatar } from "@/components/account/UserAvatar";
import { OwnerVerifyNote } from "@/components/account/OwnerVerifyNote";
import { MedalArt } from "@/components/profile/MedalArt";
import { MedalTile, PassportNumbers, ReviewedList } from "@/components/profile/PassportParts";
import { FlauntMedals } from "@/components/profile/FlauntMedals";
import { NotOwner } from "@/components/profile/NotOwner";
import { ShareProfile } from "@/components/profile/ShareProfile";
import { MEDALS, STARTER_MEDALS } from "@/lib/profile/medals";
import { medalLook } from "@/lib/profile/medalShapes";
import { loadPublicPassport, readPublicProfile } from "@/lib/profile/publicProfile";

// A TapTurf player's public profile: username, name, photo, join month
// and the verified tick (a number and an email both confirmed; never
// which one is missing), then what they can flaunt: how many games,
// turfs, cities and sports, their best weekly streak, the medals they
// earned and the turfs they reviewed (lib/profile/passport.ts
// publicPassport: counts only, never where or when they played, or who
// with). A profile with a medal is dressed in its top medal's colours:
// the picture in a glowing ring of them with the medal on its corner, a
// one-line brag, and the top medal shown off with its name, what it was
// for and "7 of 16 medals". For whoever is looking, "Yours to earn": the
// three starter medals with a way to /games and to hosting (no numbers,
// no hurry; hidden from the profile's own player in the browser). Its
// owner, signed in, gets "Flaunt my medals" (their medals as an Instagram
// story picture, components/profile/FlauntMedals.tsx) and "Share my
// profile", both decided in the browser: this render is the same for
// everyone and reads nothing more than before. Tags on live scorecards
// link here. Only for people who left "Let others find and tag me" on;
// an old username 308s to the current one. Kept out of search engines
// and the sitemap.

// A minute: someone who turns tagging off disappears from here that soon.
export const revalidate = 60;

export function generateStaticParams() {
  return [];
}

/** One read per render (the metadata and the page ask for the same profile). */
const loadProfile = cache(readPublicProfile);

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

/** What a visitor does for each starter medal. */
const STARTER_STEP: Record<string, string> = { "first-game": "Play your first game", "first-host": "Host a game", "first-review": "Review a turf you played at" };

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
  const many = (n: number, one: string, more: string) => `${n} ${n === 1 ? one : more}`;
  // "5 games · 5 turfs · 2 cities", once there is a game.
  const brag =
    counts && counts.games > 0
      ? [many(counts.games, "game", "games"), counts.turfs ? many(counts.turfs, "turf", "turfs") : null, counts.cities ? many(counts.cities, "city", "cities") : null]
          .filter(Boolean)
          .join(" · ")
      : null;
  const medals = passport?.medals ?? [];
  const top = medals[0] ?? null;
  // The hero dresses in the top medal's own colours (lib/profile/medalShapes.ts).
  const look = top ? medalLook(top.art.tone) : null;
  const starters = STARTER_MEDALS.map((id) => MEDALS.find((m) => m.id === id)).filter((m) => !!m);

  return (
    <div className="max-w-md mx-auto px-4 py-10 sm:py-14">
      <div className="relative overflow-hidden bg-white rounded-3xl shadow-elevated text-center">
        {/* A wash of the top medal's colour behind the picture. */}
        {look && <div aria-hidden className="absolute inset-x-0 top-0 h-36" style={{ background: `linear-gradient(180deg, ${look.soft} 0%, ${look.wash} 55%, #FFFFFF 100%)` }} />}
        <div className="relative px-5 sm:px-6 pt-8 pb-7">
          {top && look ? (
            // The picture in a ring of the medal's colours, glowing in them, with the medal itself on its corner.
            <span className="relative inline-block rounded-full p-[5px]" style={{ background: `linear-gradient(135deg, ${look.ring} 0%, ${look.face} 45%, ${look.rim} 100%)`, boxShadow: `0 0 0 6px ${look.soft}, 0 14px 30px -6px ${look.glow}` }}>
              <UserAvatar src={photo} name={name} size={104} eager className="ring-4 ring-white" />
              <span aria-hidden className="absolute -bottom-1.5 -right-2.5 grid h-11 w-11 place-items-center rounded-full bg-white shadow-md">
                <MedalArt art={top.art} size={38} />
              </span>
            </span>
          ) : (
            <UserAvatar src={photo} name={name} size={96} eager className="mx-auto ring-4 ring-accent-50" />
          )}
          <h1 className="mt-4 font-display text-[26px] min-[360px]:text-3xl text-primary-900 leading-tight break-words">
            {name}
            {verified && <VerifiedTick size="lg" className="ml-1.5 align-[-0.1em]" />}
          </h1>
          <p className="mt-1 text-[15px] text-primary-500">@{u}</p>
          {brag && <p className="mt-3 inline-flex items-center rounded-full bg-white/80 ring-1 ring-primary-200 px-3.5 py-1 text-[14px] font-semibold text-primary-800 tabular-nums">{brag}</p>}
          {verified && <p className="mt-2 text-[13px] font-medium text-sky-700">Verified · Phone and email confirmed</p>}
          {month && <p className="mt-3 text-[13px] text-primary-500">On TapTurf since {month}</p>}

          {top && look && (
            // The top medal, shown off: its drawing in its own glow, its name and what it was for, and how many of them all are earned.
            <div className="mt-5 rounded-2xl px-4 py-4 text-left" style={{ background: look.wash, boxShadow: `inset 0 0 0 1px ${look.soft}` }}>
              <div className="flex items-center gap-4">
                <span className="shrink-0" style={{ filter: `drop-shadow(0 6px 10px ${look.glow})` }}>
                  <MedalArt art={top.art} size={76} />
                </span>
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: look.text }}>
                    Top medal
                  </p>
                  <p className="font-display text-[24px] leading-tight text-primary-900 text-balance">{top.name}</p>
                  <p className="text-[14px] text-primary-600">{top.blurb}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <span className="block h-2 flex-1 overflow-hidden rounded-full bg-white" style={{ boxShadow: `inset 0 0 0 1px ${look.soft}` }} aria-hidden>
                  <span className="block h-full rounded-full" style={{ width: `${Math.round((medals.length / MEDALS.length) * 100)}%`, background: look.face }} />
                </span>
                <p className="shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: look.text }}>
                  {medals.length} of {MEDALS.length} medals
                </p>
              </div>
            </div>
          )}

          {/* Only its owner, signed in, gets these (decided in the browser: this render is the same for everyone). */}
          <div className="mt-4 flex flex-wrap justify-center gap-2 empty:hidden">
            <FlauntMedals username={u} from="profile" count={medals.length} />
            <ShareProfile username={u} />
          </div>
        </div>
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
                { label: "Played", value: counts.games, sr: counts.games === 1 ? "game" : "games" },
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

          {medals.length > 0 && (
            <section aria-labelledby="u-medals" className="mt-8">
              <div className="mb-3 flex items-end justify-between gap-3">
                <h2 id="u-medals" className="font-display text-[20px] font-semibold text-primary-900">
                  Medals
                </h2>
                <p className="text-[13px] text-primary-500 tabular-nums">
                  {medals.length} of {MEDALS.length} earned
                </p>
              </div>
              <ul className="grid grid-cols-2 min-[360px]:grid-cols-3 gap-2">
                {medals.map((m) => (
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

      {/* For whoever is looking: the first three medals, and where to start on them. Not shown to the profile's own player. */}
      <NotOwner username={u}>
        <section aria-labelledby="u-earn" className="mt-8 rounded-3xl bg-primary-900 px-5 py-6 text-white">
          <h2 id="u-earn" className="font-display text-[22px] leading-tight">
            Yours to earn
          </h2>
          <p className="mt-1 text-[14px] leading-snug text-white/75">Medals are earned from real games and reviews, never given. These three come first.</p>
          <ul className="mt-4 grid grid-cols-3 gap-2">
            {starters.map((m) => (
              <li key={m.id} className="flex flex-col items-center rounded-2xl bg-white/[0.07] px-1.5 py-3 text-center ring-1 ring-inset ring-white/10">
                <MedalArt art={m.art} size={56} />
                <p className="mt-2 text-[13px] font-semibold leading-tight text-balance">{m.name}</p>
                <p className="mt-1 text-[12px] leading-snug text-white/70 text-balance">{STARTER_STEP[m.id] ?? m.blurb}</p>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/games" className="inline-flex min-h-[44px] flex-1 items-center justify-center whitespace-nowrap rounded-full bg-white px-5 text-[15px] font-semibold text-primary-900 focus-neon">
              Find a game
            </Link>
            <Link href="/game/create" className="inline-flex min-h-[44px] flex-1 items-center justify-center whitespace-nowrap rounded-full px-5 text-[15px] font-semibold text-white ring-1 ring-inset ring-white/40 focus-neon">
              Host a game
            </Link>
          </div>
        </section>
      </NotOwner>

      <p className="mt-6 text-center text-[14px] text-primary-600">
        Looking for a place to play?{" "}
        <Link href="/turfs" className="font-semibold text-accent-700 underline underline-offset-2">
          Browse turfs
        </Link>
      </p>
    </div>
  );
}
