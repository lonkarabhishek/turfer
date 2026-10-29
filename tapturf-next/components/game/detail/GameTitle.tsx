import { MapPin } from "lucide-react";
import { VerifiedTickFor } from "@/components/account/VerifiedTick";
import { Avatar } from "./Avatar";

/**
 * The white sheet under the photo: the venue as the page's heading (never
 * cut short; a long name wraps), where it is, and who hosts.
 */
export function GameTitle({
  venue,
  sportName,
  place,
  hostName,
  hostPhoto,
  hostId,
  isHost,
}: {
  /** The turf's name, or "{Sport} game" when the game has no turf. */
  venue: string;
  sportName: string;
  place: string;
  hostName: string;
  hostPhoto?: string | null;
  hostId: string;
  isHost: boolean;
}) {
  return (
    <div>
      <h1 className="text-[24px] lg:text-[32px] font-bold leading-[1.15] tracking-[-0.01em] text-primary-900 text-balance [overflow-wrap:anywhere]">
        <span className="sr-only">{sportName} game at </span>
        {venue}
      </h1>
      {place && (
        <p className="mt-1.5 flex items-start gap-1.5 text-[15px] text-primary-500">
          <MapPin className="w-4 h-4 mt-[3px] shrink-0" aria-hidden />
          <span>{place}</span>
        </p>
      )}
      <p className="mt-2 flex items-center gap-2 text-[14px] text-primary-700 min-w-0">
        <Avatar src={hostPhoto} name={hostName} className="size-6 text-[11px]" />
        <span className="min-w-0 truncate">
          Hosted by <span className="font-semibold text-primary-900">{isHost ? "you" : hostName || "a TapTurf player"}</span>
        </span>
        <VerifiedTickFor id={hostId} className="-ml-1" />
      </p>
    </div>
  );
}
