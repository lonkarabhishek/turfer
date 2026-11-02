import { Camera, Plus } from "lucide-react";
import { ownerPhotoNudge } from "@/lib/my/photoMath";

/**
 * On a turf's dashboard (/my/turf/<id>): while its owners have added fewer
 * than 3 photos of their own (lib/my/photoMath.ts ownerPhotoNudge), a card
 * asking for them, with a button down to the Photos section, where they
 * are added (OwnerPhotos). Nothing until that section has counted them.
 */
export function OwnerPhotoNudge({ mine, className = "" }: { mine: number | null; className?: string }) {
  const n = mine == null ? null : ownerPhotoNudge(mine);
  if (!n) return null;
  return (
    <section aria-label={n.title} className={`rounded-2xl border border-accent-200 bg-accent-50/40 p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${className}`}>
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <span className="w-10 h-10 shrink-0 rounded-full bg-accent-50 text-accent-700 inline-flex items-center justify-center">
          <Camera className="w-5 h-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-primary-900 leading-snug">{n.title}</p>
          <p className="mt-0.5 text-[13px] text-primary-600 leading-snug">
            {n.body}
            {n.progress && <> {n.progress}</>}
          </p>
        </div>
      </div>
      <a
        href="#photos"
        className="press-tight self-start sm:self-auto shrink-0 inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-full bg-primary-900 hover:bg-primary-700 text-white text-[13px] font-semibold transition-colors"
      >
        <Plus className="w-4 h-4" aria-hidden /> Add photos
      </a>
    </section>
  );
}
