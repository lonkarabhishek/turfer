"use client";

import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import type { GameRequest } from "@/types/game";
import { VerifiedTickFor } from "@/components/account/VerifiedTick";
import { askedAgo } from "@/lib/utils/game";
import { Avatar } from "./detail/Avatar";

interface Props {
  request: GameRequest;
  onAccept: () => void | Promise<void>;
  onDecline: () => void | Promise<void>;
}

/**
 * One join request for the host: who, when they asked, their note, and
 * Decline / Accept (each names the person for screen readers). What the
 * buttons do is unchanged; the card only shows it.
 */
export function GameRequestCard({ request, onAccept, onDecline }: Props) {
  const [acting, setActing] = useState<"accept" | "decline" | null>(null);
  const name = request.requester_name || "Player";

  const handleAccept = async () => {
    setActing("accept");
    await onAccept();
    setActing(null);
  };

  const handleDecline = async () => {
    setActing("decline");
    await onDecline();
    setActing(null);
  };

  const who = (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar src={request.requester_avatar} name={name} className="size-10 text-[15px]" />
      <div className="min-w-0">
        <p className="flex items-center gap-1 min-w-0 text-[16px] font-semibold text-primary-900">
          <span className="truncate">{name}</span>
          <VerifiedTickFor id={request.user_id} />
        </p>
        {request.created_at && <p className="text-[13px] text-primary-500">Asked {askedAgo(request.created_at)}</p>}
      </div>
    </div>
  );

  if (request.status !== "pending") {
    const ok = request.status === "accepted";
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary-200 bg-white p-3">
        {who}
        <span className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[13px] font-semibold ${ok ? "bg-accent-50 text-accent-800" : "bg-primary-100 text-primary-700"}`}>
          {ok ? <Check className="w-3.5 h-3.5" aria-hidden /> : <X className="w-3.5 h-3.5" aria-hidden />}
          {ok ? "Accepted" : "Declined"}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-primary-200 bg-white p-4">
      {who}
      {request.note && (
        <p className="mt-3 rounded-xl bg-primary-50 p-3 text-[15px] leading-relaxed text-primary-800 [overflow-wrap:anywhere]">
          &ldquo;{request.note}&rdquo;
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleDecline}
          disabled={acting !== null}
          className="h-11 inline-flex items-center justify-center gap-1.5 rounded-full border border-primary-300 bg-white text-[15px] font-semibold text-primary-900 hover:bg-primary-50 disabled:opacity-50"
        >
          {acting === "decline" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <X className="w-4 h-4" aria-hidden />}
          Decline<span className="sr-only"> {name}</span>
        </button>
        <button
          type="button"
          onClick={handleAccept}
          disabled={acting !== null}
          className="h-11 inline-flex items-center justify-center gap-1.5 rounded-full bg-accent-600 hover:bg-accent-700 text-[15px] font-semibold text-white disabled:opacity-50"
        >
          {acting === "accept" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Check className="w-4 h-4" aria-hidden />}
          Accept<span className="sr-only"> {name}</span>
        </button>
      </div>
    </div>
  );
}
