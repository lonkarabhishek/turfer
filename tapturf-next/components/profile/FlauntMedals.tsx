"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { Sparkles } from "lucide-react";
import { useHydrated } from "@/components/account/useVerified";
import { useAuth } from "@/components/auth/AuthProvider";
import { gaEvent } from "@/lib/analytics/ga";
import { FLAUNT_COPY as C } from "@/lib/profile/flaunt";

// Fetched on the first tap, so the pages it sits on carry only the button.
const FlauntSheet = dynamic(() => import("./FlauntSheet").then((m) => m.FlauntSheet), { ssr: false });

/**
 * "Flaunt my medals": opens the sheet with the player's medals as an
 * Instagram story picture (FlauntSheet.tsx; GET /api/og/medals/<username>).
 * Only for the signed-in player's own medals: in the Me tab's medals
 * section, and on their own public profile (pass `username`, the page's),
 * beside "Share my profile". Nothing without an earned medal (`count`),
 * and nothing in the server render: the profile page is the same for
 * everyone.
 */
export function FlauntMedals({ username, count, from, className = "" }: { username?: string | null; count: number; from: "passport" | "profile"; className?: string }) {
  const { user } = useAuth();
  // After hydration: a phone sign-in is known on the first render in the browser, and that render must match the server's.
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  if (!hydrated || !user || count <= 0 || (username && username !== user.username)) return null;

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        data-flaunt=""
        onClick={() => {
          gaEvent("medal_story_open", { from, medals: count });
          setOpen(true);
        }}
        className={`inline-flex items-center justify-center gap-2 min-h-[44px] rounded-full bg-accent-600 px-5 text-[14px] font-semibold text-white hover:bg-accent-700 transition-colors cursor-pointer focus-neon ${className}`}
      >
        <Sparkles className="w-4 h-4" aria-hidden />
        {C.button}
      </button>
      {/* On the body: a sheet inside a card or a sticky column would sit under the site's header. */}
      {open && createPortal(<FlauntSheet user={user} from={from} count={count} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
