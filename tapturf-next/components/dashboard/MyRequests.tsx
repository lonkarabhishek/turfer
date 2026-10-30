"use client";

import Link from "next/link";
import { Clock, Check, X, Trash2, ChevronRight, MessageSquare, Gamepad2 } from "lucide-react";
import { cancelMyRequest, type GameLine } from "@/lib/queries/games";
import { askedAgo, formatDate, formatTimeSlot } from "@/lib/utils/game";
import { Avatar } from "@/components/game/detail/Avatar";
import { VerifiedTickFor } from "@/components/account/VerifiedTick";
import type { Game, GameRequest } from "@/types/game";

/**
 * Requests on the Me tab: first the players waiting for this person's
 * answer (pending requests to join the games they host; the answer is
 * given on the game page, as before), then the requests they sent, each
 * naming its game and host. The lists come from the Me tab (useMeData),
 * which counts the pending ones.
 */
export function MyRequests({
  userId,
  requests,
  requestGames,
  incoming,
  hosted,
  loading,
  reloadRequests,
}: {
  userId: string;
  requests: GameRequest[];
  requestGames: Map<string, GameLine>;
  incoming: GameRequest[];
  hosted: Game[];
  loading: boolean;
  reloadRequests: () => Promise<void>;
}) {
  const handleCancel = async (requestId: string) => {
    await cancelMyRequest(requestId, userId);
    await reloadRequests();
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border border-primary-200 rounded-2xl p-4 animate-pulse">
            <div className="w-2/3 h-5 bg-primary-100 rounded mb-2" />
            <div className="w-1/3 h-4 bg-primary-50 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (requests.length === 0 && incoming.length === 0) {
    return (
      <div className="text-center py-14">
        <div className="w-14 h-14 bg-accent-50 border border-accent-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <MessageSquare className="w-6 h-6 text-accent-600" />
        </div>
        <p className="text-[15px] font-semibold text-primary-800 mb-1">No requests yet</p>
        <p className="text-[13px] text-primary-500 mb-6">Find a game near you and tap Join</p>
        <Link
          href="/games"
          className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white text-sm font-bold px-5 py-3 rounded-full transition-colors shadow-neon focus-neon"
        >
          <Gamepad2 className="w-4 h-4" />
          Browse games
        </Link>
      </div>
    );
  }

  const hostedById = new Map(hosted.map((g) => [g.id, g]));
  const pending = requests.filter((r) => r.status === "pending");
  const handled = requests.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-7">
      {/* Players waiting on you */}
      {incoming.length > 0 && (
        <section aria-labelledby="req-in-h">
          <h2 id="req-in-h" className="text-[13px] font-bold text-primary-800 mb-2.5">
            Waiting for your answer · {incoming.length}
          </h2>
          <ul className="space-y-2.5">
            {incoming.map((req) => {
              const g = hostedById.get(req.game_id);
              const name = req.requester_name || "Player";
              return (
                <li key={req.id} className="rounded-2xl border-2 border-accent-500/40 bg-accent-50/40 p-3.5">
                  <div className="flex items-center gap-3">
                    <Avatar src={req.requester_avatar} name={name} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 min-w-0 text-[15px] font-semibold text-primary-900">
                        <span className="truncate">{name}</span>
                        <VerifiedTickFor id={req.user_id} />
                      </p>
                      <p className="text-[13px] text-primary-600">
                        {g ? `${g.sport} · ${formatDate(g.date)}, ${formatTimeSlot(g.start_time, g.end_time)}` : "Your game"}
                      </p>
                    </div>
                    <Link
                      href={`/game/${req.game_id}`}
                      className="shrink-0 inline-flex items-center gap-1 min-h-[44px] px-4 rounded-full bg-accent-500 hover:bg-accent-600 text-white text-[13px] font-bold transition-colors focus-neon"
                      aria-label={`Review ${name}'s request`}
                    >
                      Review
                      <ChevronRight className="w-3.5 h-3.5" aria-hidden />
                    </Link>
                  </div>
                  {req.note && <p className="mt-2.5 text-[13px] text-primary-700 italic break-words">&ldquo;{req.note}&rdquo;</p>}
                  {req.created_at && <p className="mt-1.5 text-[12px] text-primary-500">Asked {askedAgo(req.created_at)}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Requests you sent: pending first */}
      {requests.length > 0 && (
        <section aria-labelledby="req-out-h">
          <h2 id="req-out-h" className="text-[13px] font-bold text-primary-800 mb-2.5">
            {incoming.length > 0 ? "Your requests" : "Requests you sent"}
          </h2>
          <ul className="space-y-2.5">
            {[...pending, ...handled].map((req) => (
              <SentRow key={req.id} req={req} game={requestGames.get(req.game_id)} onCancel={() => void handleCancel(req.id)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const STATUS = {
  pending: { label: "Pending", icon: Clock, cls: "bg-amber-50 text-amber-800 border border-amber-200" },
  accepted: { label: "Accepted", icon: Check, cls: "bg-accent-50 text-accent-800 border border-accent-500/40" },
  declined: { label: "Declined", icon: X, cls: "bg-primary-100 text-primary-600" },
} as const;

/** One request this person sent: the game (sport, time, venue), its host, the status, their note; Cancel while pending. */
function SentRow({ req, game, onCancel }: { req: GameRequest; game: GameLine | undefined; onCancel: () => void }) {
  const s = STATUS[req.status] ?? STATUS.pending;
  const Icon = s.icon;
  const open = req.status === "pending";
  return (
    <li className={`rounded-2xl border bg-white p-3.5 ${open ? "border-amber-200" : "border-primary-200"}`}>
      <div className="flex items-start justify-between gap-3">
        <Link href={`/game/${req.game_id}`} className="group min-w-0 flex-1 rounded-lg focus-neon">
          <span className="flex items-center gap-1 text-[15px] font-semibold text-primary-900 group-hover:text-accent-700 transition-colors">
            <span className="truncate">{game ? `${game.sport}${game.venue ? ` at ${game.venue}` : ""}` : "View game"}</span>
            <ChevronRight className="w-3.5 h-3.5 shrink-0" aria-hidden />
          </span>
          {game && (
            <span className="mt-0.5 block text-[13px] text-primary-600">
              {formatDate(game.date)}, {formatTimeSlot(game.start_time, game.end_time)}
            </span>
          )}
        </Link>
        <span className={`shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12px] font-semibold ${s.cls}`}>
          <Icon className="w-3.5 h-3.5" aria-hidden />
          {s.label}
        </span>
      </div>

      {game && (
        <p className="mt-2.5 flex items-center gap-2 min-w-0 text-[13px] text-primary-700">
          <Avatar src={game.host_profile_image_url} name={game.host_name} size={22} />
          <span className="truncate">Hosted by {game.host_name || "a TapTurf player"}</span>
          <VerifiedTickFor id={game.creator_id} className="-ml-1" />
        </p>
      )}

      {req.note && <p className="mt-2 text-[13px] text-primary-600 italic break-words">&ldquo;{req.note}&rdquo;</p>}

      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-[12px] text-primary-500">
          Sent {new Date(req.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", timeZone: "Asia/Kolkata" })}
        </span>
        {open && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 min-h-[36px] text-[13px] font-semibold text-hot-600 hover:bg-hot-500/10 px-2.5 rounded-full transition-colors focus-neon"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden />
            Cancel request
          </button>
        )}
      </div>
    </li>
  );
}
