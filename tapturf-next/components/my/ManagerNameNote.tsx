"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AtSign } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useHydrated } from "@/components/account/useVerified";
import { createClient } from "@/lib/supabase/client";
import { PROFILE_PATH } from "@/lib/account/display";
import { managerNote, shapeTurfManagers } from "@/lib/turfPage/managers";

/** Where a username is picked: Profile, scrolled to the username box (ProfileSection focuses it). */
export const USERNAME_HREF = `${PROFILE_PATH}#username`;

/**
 * On myTapturf: whether players see who runs the turf. A claimed turf's
 * page says "Managed by @name" for each manager with a username and
 * "Let others find and tag me" on (public.turf_managers). Without a
 * username, or with the switch off, this asks for one; on a turf's
 * dashboard (turfId given) it also says when the page names them, from
 * the same public read the page uses, so it is never a guess.
 *
 * The TapTurf owner opens every turf without a claim: they are not on
 * the line, so they see nothing here unless their own username is
 * missing or hidden.
 */
export function ManagerNameNote({
  turfName,
  turfId,
  pageHref,
  username: given,
  className = "",
}: {
  /** The turf's name; null for "your turfs" (several). */
  turfName: string | null;
  /** One turf's dashboard: read who its page names. */
  turfId?: string;
  /** That turf's public page, for "See it". */
  pageHref?: string;
  /** The account's username as myTapturf read it (owner_home); else the signed-in profile's. */
  username?: string | null;
  className?: string;
}) {
  const { user } = useAuth();
  const hydrated = useHydrated();
  const [shown, setShown] = useState<string[] | null>(null);

  useEffect(() => {
    if (!turfId) return;
    let live = true;
    // The page's own read. A database without it answers an error: no "shown" note, nothing else changes.
    createClient()
      .rpc("turf_managers", { p_turf_id: turfId })
      .then(
        ({ data, error }) => {
          if (live && !error) setShown(shapeTurfManagers(data).list.map((m) => m.u));
        },
        () => {},
      );
    return () => {
      live = false;
    };
  }, [turfId]);

  if (!hydrated || !user) return null;
  const username = given !== undefined ? given : (user.username ?? null);
  const note = managerNote({ username, taggable: username === user.username ? user.taggable : undefined, shown });
  if (!note) return null;
  const who = turfName ?? "your turfs";

  if (note.kind === "shown") {
    return (
      <p className={`text-[13px] text-primary-500 leading-snug ${className}`}>
        Players see &ldquo;Managed by <span className="font-semibold text-primary-800">@{note.u}</span>&rdquo; with the Owner-managed badge on your page.
        {pageHref && (
          <>
            {" "}
            <Link href={`${pageHref}#managed-by`} target="_blank" className="font-semibold text-accent-700 hover:underline underline-offset-2">
              See it
            </Link>
          </>
        )}
      </p>
    );
  }

  return (
    <section className={`rounded-2xl border border-primary-200 bg-primary-50/60 p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${className}`}>
      <span className="hidden sm:flex w-9 h-9 shrink-0 rounded-full bg-white items-center justify-center">
        <AtSign className="w-4.5 h-4.5 text-primary-600" />
      </span>
      <div className="min-w-0 flex-1">
        {note.kind === "pick" ? (
          <>
            <p className="text-[14px] font-semibold text-primary-900 leading-snug">Pick a username so players see who runs {who}</p>
            <p className="mt-0.5 text-[13px] text-primary-600 leading-snug">
              {turfName ? "The turf’s page" : "Each turf’s page"} shows the Owner-managed badge, and will then say &ldquo;Managed by @your-username&rdquo;. Your number and email never show.
            </p>
          </>
        ) : (
          <>
            <p className="text-[14px] font-semibold text-primary-900 leading-snug">Your username is hidden, so players don&rsquo;t see who runs {who}</p>
            <p className="mt-0.5 text-[13px] text-primary-600 leading-snug">
              Turn on &ldquo;Let others find and tag me&rdquo; in Profile to show it.
            </p>
          </>
        )}
      </div>
      <Link
        href={USERNAME_HREF}
        prefetch={false}
        className="press-tight self-start sm:self-auto shrink-0 inline-flex items-center justify-center h-10 px-4 rounded-full border border-primary-300 bg-white hover:border-primary-500 text-primary-900 text-[13px] font-semibold transition-colors"
      >
        {note.kind === "pick" ? "Pick a username" : "Open Profile"}
      </Link>
    </section>
  );
}
