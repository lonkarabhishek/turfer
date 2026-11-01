"use client";

import { Share2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * "Share my profile": the signed-in player's own public profile link
 * (/u/<username>), through the phone's share sheet, else WhatsApp. Only
 * for a username whose profile is public, and only to its owner: the
 * page it opens shows counts, medals and reviewed turfs, nothing private.
 * Nothing in the server render (the profile page is the same for everyone).
 */
export function ShareProfile({ username, className = "" }: { username?: string | null; className?: string }) {
  const { user } = useAuth();
  const u = user?.username;
  if (!u || user?.taggable === false || (username && username !== u)) return null;

  const share = async () => {
    const url = `${window.location.origin}/u/${u}`;
    const text = "My games, medals and turfs on TapTurf";
    try {
      if (navigator.share) {
        await navigator.share({ title: "TapTurf", text, url });
        return;
      }
    } catch {
      return; // they closed the share sheet
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text}: ${url}`)}`, "_blank", "noopener");
  };

  return (
    <button
      type="button"
      onClick={() => void share()}
      className={`inline-flex items-center justify-center gap-2 min-h-[44px] rounded-full border border-primary-200 bg-white px-5 text-[14px] font-semibold text-primary-800 hover:border-accent-500 transition-colors focus-neon ${className}`}
    >
      <Share2 className="w-4 h-4 text-accent-600" aria-hidden />
      Share my profile
    </button>
  );
}
