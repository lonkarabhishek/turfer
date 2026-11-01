"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, MessageCircle, Users } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { UserAvatar } from "@/components/account/UserAvatar";
import { PROFILE_PATH, spacedPhone } from "@/lib/account/display";
import { PHONE_STEP } from "@/lib/account/verified";
import { shortDay } from "@/lib/profile/history";
import { spacedWhatsapp, whatsappLink, type PlayedWithPerson } from "@/lib/profile/playedWith";
import { setWhatsapp } from "@/lib/profile/client";
import type { WhatsAppState } from "@/lib/profile/types";

/**
 * Played with, on the Me tab only: the people in the same played games,
 * most games together first, each linking to their public profile when
 * they have one. A WhatsApp button shows only for someone who turned
 * sharing on, and only because the server found a game you both played
 * (public.played_with_extras); the page never hides a number it was sent.
 */

export function PlayedWithList({ people, now }: { people: PlayedWithPerson[]; now: number }) {
  if (people.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-primary-200 bg-primary-50 px-4 py-5 text-center">
        <Users className="mx-auto w-6 h-6 text-primary-400" aria-hidden />
        <p className="mt-2 text-[14px] text-primary-600">People you play TapTurf games with show here after the game.</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-primary-100 rounded-2xl border border-primary-200 bg-white">
      {people.map((p) => {
        const who = (
          <>
            <UserAvatar src={p.photo} name={p.name} size={44} />
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold text-primary-900 truncate">{p.name}</span>
              {p.username && <span className="block text-[13px] font-medium text-accent-700 truncate">@{p.username}</span>}
            </span>
          </>
        );
        return (
          <li key={p.key} className="px-4 py-3">
            <div className="flex items-center gap-3">
              {p.username ? (
                <Link href={`/u/${p.username}`} className="flex items-center gap-3 min-w-0 flex-1 rounded-xl focus-neon hover:opacity-90">
                  {who}
                </Link>
              ) : (
                <div className="flex items-center gap-3 min-w-0 flex-1">{who}</div>
              )}
              <span className="shrink-0 text-right">
                <span className="block text-[15px] font-semibold text-primary-900 tabular-nums">{p.together}</span>
                <span className="block text-[11px] text-primary-500">{p.together === 1 ? "game" : "games"}</span>
              </span>
            </div>
            <p className="mt-1 pl-[56px] text-[12px] text-primary-500">Last played together {shortDay(p.last, now)}</p>
            {p.whatsapp && (
              <a
                href={whatsappLink(p.whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 ml-[56px] inline-flex items-center gap-1.5 min-h-[40px] rounded-full bg-accent-600 px-3.5 text-[13px] font-semibold text-white hover:bg-accent-700 focus-neon"
                aria-label={`WhatsApp ${p.name} on ${spacedWhatsapp(p.whatsapp)}`}
              >
                <MessageCircle className="w-4 h-4" aria-hidden />
                <span className="tabular-nums">{spacedWhatsapp(p.whatsapp)}</span>
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * "Let players I've played with see my WhatsApp": off until its owner
 * turns it on, for a number proved with a one-time code. null: the
 * database has no sharing yet, so it says it is not available.
 */
export function WhatsAppSwitch({ initial }: { initial: WhatsAppState | null }) {
  const { user, getToken } = useAuth();
  const [state, setState] = useState<WhatsAppState | null>(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const on = state?.on === true;
  const usable = !!state && (state.phone === "ok" || on);

  const toggle = async () => {
    if (!state || busy) return;
    setNote("");
    setBusy(true);
    try {
      const tok = await getToken();
      if (!("token" in tok)) {
        if ("unknown" in tok) setNote("Couldn't reach TapTurf. Check your connection and try again.");
        return;
      }
      const a = await setWhatsapp(tok.token, !on);
      if ("ok" in a) {
        if (a.ok.whatsapp) setState(a.ok.whatsapp);
        else setNote("Not available yet.");
        return;
      }
      if (a.whatsapp) setState(a.whatsapp);
      setNote(a.error === "not_allowed" ? "Confirm your number with a one-time code first." : "Couldn't save. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const number = user?.phone ? spacedPhone(user.phone) : null;
  return (
    <div className="rounded-2xl border border-primary-200 bg-white px-4 py-3 mb-3">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby="wa-share-detail"
        disabled={!usable || busy}
        onClick={() => void toggle()}
        className="w-full min-h-14 py-1 flex items-center justify-between gap-4 text-left cursor-pointer disabled:cursor-not-allowed"
      >
        <span className="min-w-0 text-[14px] font-semibold text-primary-800">Let players I&rsquo;ve played with see my WhatsApp</span>
        <span className={`relative w-[51px] h-[31px] rounded-full shrink-0 transition-colors ${on ? "bg-accent-500" : "bg-primary-300"} ${!usable ? "opacity-50" : ""}`} aria-hidden>
          {busy ? (
            <Loader2 className="absolute inset-0 m-auto w-4 h-4 animate-spin text-white" />
          ) : (
            <span className={`absolute top-[2px] left-[2px] w-[27px] h-[27px] bg-white rounded-full shadow-sm motion-safe:transition-transform motion-safe:duration-200 ${on ? "translate-x-[20px]" : ""}`} />
          )}
        </span>
      </button>
      <p id="wa-share-detail" className="text-[12px] leading-relaxed text-primary-500">
        {state === null ? (
          <>Not available yet. Your number stays private.</>
        ) : (
          <>
            Off unless you turn it on. When it&rsquo;s on, people who played a TapTurf game with you (a game that has happened) see your number
            {number && state.phone !== "none" ? <>, <span className="whitespace-nowrap tabular-nums">{number}</span>,</> : ""} and a WhatsApp button in their Played with
            list. Nobody else does: it isn&rsquo;t on your public profile or anywhere else. Turn it off any time and it&rsquo;s gone from their lists.
          </>
        )}
      </p>
      {state?.phone === "none" && (
        <p className="mt-1.5 text-[12px] font-medium text-primary-700">
          Add your phone number in{" "}
          <Link href={PROFILE_PATH} className="font-semibold text-accent-700 underline underline-offset-2">
            Profile
          </Link>{" "}
          to use this.
        </p>
      )}
      {state?.phone === "unproven" && (
        <p className="mt-1.5 text-[12px] font-medium text-primary-700">
          {on ? "Your number isn't shown until you confirm it. " : ""}
          <Link href={`${PROFILE_PATH}&add=${PHONE_STEP}`} className="font-semibold text-accent-700 underline underline-offset-2">
            Confirm your number
          </Link>{" "}
          with a one-time code to use this.
        </p>
      )}
      {note && (
        <p className="mt-1.5 text-[12px] font-medium text-hot-600" role="alert">
          {note}
        </p>
      )}
    </div>
  );
}
