import { Lock, MessageCircle, Phone } from "lucide-react";
import { VerifiedTickFor } from "@/components/account/VerifiedTick";
import { waNumber } from "@/lib/utils/gameState";
import { Avatar } from "./Avatar";

/**
 * Who hosts, their note in their own words (when they wrote one), and how
 * to reach them: the number and WhatsApp for the players they accepted,
 * otherwise a line that says when it shows.
 */
export function GameHostCard({
  hostName,
  hostFirst,
  hostPhoto,
  hostId,
  note,
  isHost,
  phone,
  showNumber,
  closed = false,
}: {
  hostName: string;
  /** firstName(): "Rahul", or "the host". */
  hostFirst: string;
  hostPhoto?: string | null;
  hostId: string;
  note: string | null;
  isHost: boolean;
  /** The host's number when the game has one. */
  phone: string | null;
  /** canSeeHostNumber() for this viewer, and not the host. */
  showNumber: boolean;
  /** Ended or cancelled: no line about when the number shows. */
  closed?: boolean;
}) {
  const named = hostFirst !== "the host";
  return (
    <section aria-labelledby="host-h" className="rounded-3xl border border-primary-200 bg-white p-5 shadow-soft">
      <div className="flex items-center gap-3 min-w-0">
        <Avatar src={hostPhoto} name={hostName} className="size-12 text-[18px]" />
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

      {note && (
        <figure className="mt-4 rounded-2xl rounded-tl-md bg-primary-50 p-4">
          <figcaption className="text-[13px] font-semibold text-primary-700">
            {isHost ? "Your note" : named ? `A note from ${hostFirst}` : "A note from the host"}
          </figcaption>
          <blockquote className="mt-1 text-[16px] leading-relaxed text-primary-900 whitespace-pre-line [overflow-wrap:anywhere]">{note}</blockquote>
        </figure>
      )}

      {isHost ? (
        closed ? null : <p className="mt-4 flex items-start gap-2 text-[14px] text-primary-500">
          <Lock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          Players you accept see your number here.
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
        <p className="mt-4 flex items-start gap-2 text-[14px] text-primary-500">
          <Lock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          {named ? `Once ${hostFirst} accepts you, their number shows here.` : "Once the host accepts you, their number shows here."}
        </p>
      ) : null}
    </section>
  );
}
