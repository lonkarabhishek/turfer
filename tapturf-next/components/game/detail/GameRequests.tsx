import { UserPlus } from "lucide-react";
import type { GameRequest } from "@/types/game";
import { GameRequestCard } from "../GameRequestCard";

/**
 * The host's join requests, once on the page (phones: under the title;
 * wide screens: top of the left column). #requests is where the desktop
 * card's "2 requests waiting" link goes.
 */
export function GameRequests({
  pending,
  error,
  onAccept,
  onDecline,
}: {
  pending: GameRequest[];
  /** The last accept that failed, said in red (errors only). */
  error: string;
  onAccept: (id: string) => Promise<void>;
  onDecline: (id: string) => Promise<void>;
}) {
  const n = pending.length;
  return (
    <section id="requests" aria-labelledby="requests-h" className="scroll-mt-24 rounded-3xl border border-primary-200 bg-white p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="size-11 shrink-0 rounded-xl bg-accent-50 text-accent-700 grid place-items-center">
          <UserPlus className="w-5 h-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="requests-h" className="text-[18px] font-bold text-primary-900 leading-snug">
            {n === 0 ? "Join requests" : n === 1 ? "1 person wants to join" : `${n} people want to join`}
          </h2>
          <p className="text-[14px] text-primary-500 leading-snug">
            {n === 0 ? "No requests waiting." : "Accept to add them to the lineup. They get a notification either way."}
          </p>
        </div>
      </div>
      {error && (
        <div role="alert" className="mt-3 rounded-xl border border-hot-500/30 bg-white p-3 text-[14px] font-medium text-hot-600">
          {error}
        </div>
      )}
      {n > 0 && (
        <ul className="mt-3 space-y-3">
          {pending.map((req) => (
            <li key={req.id}>
              <GameRequestCard request={req} onAccept={() => onAccept(req.id)} onDecline={() => onDecline(req.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
