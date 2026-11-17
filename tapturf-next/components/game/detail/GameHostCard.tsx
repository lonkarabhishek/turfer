import { Lock, Megaphone, MessageCircle, Phone } from "lucide-react";
import { UPDATES_COPY, updateWhen, type UpdateEntry } from "@/lib/games/updates";
import { VerifiedTickFor } from "@/components/account/VerifiedTick";
import { waNumber } from "@/lib/utils/gameState";
import { Avatar } from "./Avatar";

/**
 * Who hosts, what they have said about the game, and how to reach them:
 * the number and WhatsApp for the players they accepted, otherwise a line
 * that says when it shows. What they said is their updates, newest first,
 * each with when it was posted (lib/games/updates.ts): the note the game
 * went up with is the first of them, at the time the game was posted. A
 * game with that note alone looks as it always did; with nothing, players
 * see nothing and the host a quiet "Post an update". The host posts from
 * here and can take an update back; nothing is edited, so the times stay
 * true.
 */
export function GameHostCard({
  hostName,
  hostFirst,
  hostPhoto,
  hostId,
  updates,
  now,
  canPost = false,
  onPost,
  onRemove,
  removing = null,
  error = "",
  isHost,
  phone,
  showNumber,
  closed = false,
  onSignIn,
}: {
  hostName: string;
  /** firstName(): "Rahul", or "the host". */
  hostFirst: string;
  hostPhoto?: string | null;
  hostId: string;
  /** updatesList(): every update, newest first, then the note the game went up with. */
  updates: readonly UpdateEntry[];
  /** For "2 h ago". */
  now: number;
  /** The host can post one now (the database takes updates, the game is on, it has fewer than 20). */
  canPost?: boolean;
  onPost?: () => void;
  onRemove?: (id: string) => void;
  /** The update being taken back. */
  removing?: string | null;
  /** Why the last take-back didn't go through, in the server's words. */
  error?: string;
  isHost: boolean;
  /** The host's number when the game has one. */
  phone: string | null;
  /** canSeeHostNumber() for this viewer, and not the host. */
  showNumber: boolean;
  /** Ended or cancelled: no line about when the number shows. */
  closed?: boolean;
  /** Signed out: the sign-in sheet, after which the number shows. */
  onSignIn?: () => void;
}) {
  const named = hostFirst !== "the host";
  // The note alone: as calm as it always was.
  const only = updates.length === 1 && updates[0].original ? updates[0] : null;
  const postButton = isHost && canPost && onPost && (
    <button
      type="button"
      onClick={onPost}
      className="h-11 inline-flex items-center gap-2 rounded-full border border-primary-300 px-4 text-[15px] font-semibold text-primary-900 hover:bg-primary-50 press-tight"
    >
      <Megaphone className="w-4 h-4" aria-hidden />
      {UPDATES_COPY.post}
    </button>
  );
  return (
    <section aria-labelledby="host-h" className="rounded-3xl border border-primary-200 bg-white p-5 shadow-soft">
      <div className="flex items-center gap-3 min-w-0">
        <Avatar src={hostPhoto} name={hostName} size={48} />
        <div className="min-w-0">
          <h2 id="host-h" className="text-[13px] font-normal text-primary-500 leading-tight">
            {isHost ? "You're the host" : "Your host"}
          </h2>
          <p className="flex items-center gap-1 min-w-0 text-[18px] font-bold text-primary-900 leading-snug">
            <span className="truncate">{hostName || "A TapTurf player"}</span>
            <VerifiedTickFor id={hostId} />
          </p>
        </div>
      </div>

      {only ? (
        <figure className="mt-4 rounded-2xl rounded-tl-md bg-primary-50 p-4">
          <figcaption className="text-[13px] font-semibold text-primary-700">
            {isHost ? "Your note" : named ? `A note from ${hostFirst}` : "A note from the host"}
          </figcaption>
          <blockquote className="mt-1 text-[16px] leading-relaxed text-primary-900 whitespace-pre-line [overflow-wrap:anywhere]">{only.text}</blockquote>
          {only.at !== null && (
            <p className="mt-1.5 text-[12px] text-primary-500">
              {UPDATES_COPY.posted} · <time dateTime={updateWhen(only, now).iso}>{updateWhen(only, now).stamp}</time>
            </p>
          )}
        </figure>
      ) : updates.length > 0 ? (
        <div className="mt-4">
          <h3 id="updates-h" className="text-[13px] font-semibold text-primary-700">
            {isHost ? UPDATES_COPY.yours : `Updates from ${named ? hostFirst : "the host"}`}
          </h3>
          <ol aria-labelledby="updates-h" className="mt-2 space-y-2">
            {updates.map((u, i) => {
              const when = updateWhen(u, now);
              return (
                <li key={u.id ?? "note"} className={`rounded-2xl rounded-tl-md p-4 ${i === 0 ? "bg-accent-50" : "bg-primary-50"}`}>
                  <p className="text-[16px] leading-relaxed text-primary-900 whitespace-pre-line [overflow-wrap:anywhere]">{u.text}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-primary-500">
                    {u.original ? (
                      <span>{UPDATES_COPY.posted}{when.stamp ? " ·" : ""}</span>
                    ) : (
                      <span className="font-semibold text-primary-700">{when.ago} ·</span>
                    )}
                    {when.stamp && <time dateTime={when.iso}>{when.stamp}</time>}
                    {isHost && u.id && onRemove && (
                      <button
                        type="button"
                        disabled={removing === u.id}
                        onClick={() => onRemove(u.id as string)}
                        aria-label={`Remove the update from ${when.stamp}`}
                        className="ml-auto -my-2 h-9 px-2 text-[13px] font-semibold text-primary-700 underline underline-offset-2 hover:text-primary-900 disabled:opacity-60"
                      >
                        {UPDATES_COPY.remove}
                      </button>
                    )}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
      {error && <p role="alert" className="mt-2 text-[14px] text-hot-600">{error}</p>}
      {postButton && (
        <div className="mt-3">
          {updates.length === 0 && <p className="mb-2 text-[14px] text-primary-500">{UPDATES_COPY.none}</p>}
          {postButton}
        </div>
      )}

      {isHost ? (
        closed ? null : <p className="mt-4 flex items-start gap-2 text-[14px] text-primary-500">
          <Lock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          Players who sign in see your number here.
        </p>
      ) : showNumber && phone ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`tel:${phone}`}
            className="h-11 inline-flex items-center gap-2 rounded-full border border-primary-300 px-4 text-[15px] font-semibold text-primary-900 hover:bg-primary-50 press-tight tabular"
          >
            <Phone className="w-4 h-4" aria-hidden />
            <span className="sr-only">Call {named ? hostFirst : "the host"} on </span>
            {phone}
          </a>
          <a
            href={`https://wa.me/${waNumber(phone)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="h-11 inline-flex items-center gap-2 rounded-full bg-[#25D366] hover:bg-[#20c25c] px-4 text-[15px] font-semibold text-[#052E16] press-tight"
          >
            <MessageCircle className="w-4 h-4" aria-hidden />
            WhatsApp
          </a>
        </div>
      ) : phone && !closed ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="flex items-start gap-2 text-[14px] text-primary-500">
            <Lock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
            {named ? `Sign in to see ${hostFirst}'s number.` : "Sign in to see the host's number."}
          </p>
          {onSignIn && (
            <button
              type="button"
              onClick={onSignIn}
              className="h-11 inline-flex items-center rounded-full bg-primary-900 hover:bg-primary-700 px-4 text-[14px] font-semibold text-white press-tight cursor-pointer"
            >
              Sign in to contact
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
