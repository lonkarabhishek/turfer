"use client";

import { useRef, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { gaEvent } from "@/lib/analytics/ga";
import { SHARE_LOCATION } from "@/lib/utils/shareLocation";

const LOOKS = {
  /** In the map's foot, beside Get directions. */
  row: "flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-primary-700 hover:bg-primary-100 transition-colors",
  /** On a game's page, as its Open in Maps button is. */
  block: "w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-full border-2 border-primary-200 bg-white text-[15px] font-semibold text-primary-900 hover:bg-primary-50",
} as const;

/**
 * "Share location": one tap sends where a turf is (lib/utils/shareLocation.ts
 * has the message and every word). On a phone the tap opens the share
 * sheet with the text, so WhatsApp is the next tap; where a browser has no
 * share sheet the text is copied and the button says so for two seconds.
 * The text is made by whoever draws the button (the turf page on the
 * server, the game page in the browser); with none it draws nothing.
 * `from` names the place it was tapped for the consent-gated count.
 */
export function ShareLocationButton({
  name,
  text,
  from,
  look = "block",
  className,
}: {
  name: string;
  text: string | null;
  from: "turf_map" | "game";
  look?: keyof typeof LOOKS;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (!text) return null;

  const share = async () => {
    gaEvent("location_share", { from });
    if (typeof navigator.share === "function") {
      try {
        // The link is inside the text: a share sheet's Copy (and some apps) takes only the text.
        await navigator.share({ title: name, text });
      } catch {
        // Closed the share sheet.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard: nothing to say.
    }
  };

  return (
    <button type="button" onClick={share} aria-label={SHARE_LOCATION.aria(name)} title={SHARE_LOCATION.aria(name)} className={`${LOOKS[look]} ${className ?? ""}`}>
      {copied ? <Check className="w-4 h-4 text-accent-700" aria-hidden /> : <Share2 className="w-4 h-4" aria-hidden />}
      <span aria-live="polite">{copied ? SHARE_LOCATION.copied : SHARE_LOCATION.label}</span>
    </button>
  );
}
