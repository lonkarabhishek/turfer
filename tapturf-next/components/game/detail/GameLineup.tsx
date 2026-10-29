"use client";

import { useState } from "react";
import { Info, Share2, UserPlus } from "lucide-react";
import { VerifiedTickFor } from "@/components/account/VerifiedTick";
import type { SpotsInfo } from "@/lib/utils/game";
import type { GameParticipant } from "@/types/game";
import { Avatar } from "./Avatar";

/** Chips shown before "Show all": 8 on phones, 16 on wide screens. */
const PHONE = 8;
const WIDE = 16;

/**
 * Who's playing: the players who joined (as today: name, photo, tick),
 * the host and you marked, then a dashed "Your spot?" chip that does what
 * the main button does, when you can still ask. The count is said once,
 * plainly; a near-empty game is an invitation, never urgency.
 */
export function GameLineup({
  participants,
  creatorId,
  viewerId,
  current,
  max,
  spots,
  ended,
  cancelled = false,
  closed,
  isHost,
  canAsk,
  onAsk,
  onShare,
  shared,
}: {
  participants: GameParticipant[];
  creatorId: string;
  viewerId: string | null;
  current: number;
  max: number;
  spots: SpotsInfo;
  ended: boolean;
  cancelled?: boolean;
  /** Full, ended or cancelled: no "the host accepts each player" line. */
  closed: boolean;
  isHost: boolean;
  /** The viewer can still ask to join (open or live). */
  canAsk: boolean;
  onAsk: () => void;
  onShare: () => void;
  /** The link was just copied. */
  shared: boolean;
}) {
  const [all, setAll] = useState(false);
  const n = participants.length;
  // The toggle stays put once pressed ("Show fewer"), so focus stays on it. Wide screens need it past 16 only.
  const toggleOnPhone = n > PHONE;
  const toggleWide = n > WIDE;
  const over = ended || cancelled;
  return (
    <section aria-labelledby="lineup-h">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="lineup-h" className="text-[20px] font-bold text-primary-900">
          {ended ? "Who played" : cancelled ? "Who joined" : "Who's playing"}
        </h2>
        <p className="text-[15px] text-primary-700 shrink-0 tabular" aria-hidden="true">
          <span className="font-semibold text-primary-900">{current}</span> of {max} {over ? "joined" : "going"}
        </p>
      </div>
      <p className="sr-only">
        {over ? `${current} of ${max} players joined.` : `${current} of ${max} players going, ${spots.hint.toLowerCase()}.`}
      </p>

      {n > 0 && (
        <ul id="lineup-players" aria-label="Players" className="mt-3 flex flex-wrap gap-2">
          {participants.map((p, i) => {
            const host = p.user_id === creatorId;
            const you = !!viewerId && p.user_id === viewerId;
            const hide = !all && i >= WIDE ? "hidden" : !all && i >= PHONE ? "max-lg:hidden" : "";
            return (
              <li
                key={p.user_id}
                className={`h-11 max-w-full rounded-full border border-primary-200 bg-white pl-1 pr-3 inline-flex items-center gap-2 ${hide}`}
              >
                <Avatar src={p.profile_image_url} name={p.name || "Player"} className="size-8 text-[13px]" />
                <span className="min-w-0 truncate text-[15px] text-primary-900">{p.name || "Player"}</span>
                <VerifiedTickFor id={p.user_id} className="-ml-1" />
                {host && <span className="text-[12px] font-semibold bg-accent-50 text-accent-800 px-2 rounded-full leading-5">Host</span>}
                {you && !host && <span className="text-[12px] font-semibold bg-primary-100 text-primary-900 px-2 rounded-full leading-5">You</span>}
              </li>
            );
          })}
        </ul>
      )}
      {(toggleOnPhone || canAsk) && (
        <div className={`mt-2 flex flex-wrap items-center gap-3 ${!canAsk && !toggleWide ? "lg:hidden" : ""}`}>
          {toggleOnPhone && (
            <button
              type="button"
              onClick={() => setAll((v) => !v)}
              aria-expanded={all}
              aria-controls="lineup-players"
              className={`h-11 text-[15px] font-semibold text-accent-800 hover:underline underline-offset-2 ${toggleWide ? "" : "lg:hidden"}`}
            >
              {all ? "Show fewer" : `Show all ${n}`}
            </button>
          )}
          {canAsk && (
            <button
              type="button"
              onClick={onAsk}
              aria-label="Request to join this game"
              className="h-11 inline-flex items-center gap-2 rounded-full border-2 border-dashed border-accent-600 px-3 text-[15px] font-semibold text-accent-800 hover:bg-accent-50"
            >
              <UserPlus className="w-5 h-5" aria-hidden />
              Your spot?
            </button>
          )}
        </div>
      )}

      <p className="mt-3 text-[15px] text-primary-900">{isHost ? spots.plainLine : spots.line}</p>
      {!closed && !isHost && (
        <p className="mt-1 flex items-center gap-1.5 text-[14px] text-primary-500">
          <Info className="w-4 h-4 shrink-0" aria-hidden />
          The host accepts each player.
        </p>
      )}
      {isHost && !closed && spots.open > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-[14px] text-primary-500">Share the link to fill the open spots.</p>
          <button
            type="button"
            onClick={onShare}
            className="h-11 inline-flex items-center gap-2 rounded-full border border-primary-300 px-4 text-[15px] font-semibold text-primary-900 hover:bg-primary-50"
          >
            <Share2 className="w-4 h-4" aria-hidden />
            {shared ? "Link copied" : "Share"}
          </button>
        </div>
      )}
    </section>
  );
}
