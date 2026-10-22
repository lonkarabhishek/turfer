import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { User } from "lucide-react";
import { createReadOnlyClient } from "@/lib/supabase/server";

// A TapTurf player's public profile: username, name, photo and join
// month, nothing else. Tags on live scorecards link here. Only for people
// who left "Let others find and tag me" on; an old username 308s to the
// current one. Kept out of search engines and the sitemap.

// A minute: someone who turns tagging off disappears from here that soon.
export const revalidate = 60;

export function generateStaticParams() {
  return [];
}

type Profile = { u: string; name: string; photo: string | null; since: string | null };
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
  const { u, name, photo, since } = found.profile;
  if (raw !== u) permanentRedirect(`/u/${u}`);
  const month = sinceText(since);

  return (
    <div className="max-w-md mx-auto px-4 py-12 sm:py-16">
      <div className="bg-white rounded-2xl shadow-elevated px-6 py-8 text-center">
        {photo ? (
          <img
            src={photo}
            alt=""
            className="w-24 h-24 rounded-full object-cover mx-auto"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-primary-100 flex items-center justify-center mx-auto" aria-hidden>
            <User className="w-10 h-10 text-primary-400" />
          </div>
        )}
        <h1 className="mt-4 font-display text-3xl text-primary-900 leading-tight break-words">{name}</h1>
        <p className="mt-1 text-[15px] text-primary-500">@{u}</p>
        {month && <p className="mt-3 text-[13px] text-primary-500">On TapTurf since {month}</p>}
      </div>

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
