"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { addPhoto, discardPhoto } from "@/lib/reviews/client";
import type { DraftPhoto } from "@/lib/reviews/draft";
import { photoErrorText, REVIEW_PHOTOS, reviewPhotoUrl } from "@/lib/reviews/photos";
import type { PhotoAddResponse } from "@/lib/reviews/types";
import type { TokenCheck } from "@/lib/account/client";

type Pending = { key: number; preview: string };

/**
 * "Photos from your game" on the sheet's last screen: up to 3, from the
 * camera or the gallery (the phone offers both). Each is made smaller on
 * the phone (lib/reviews/photoPrep.ts, loaded only now), checked by the
 * server and kept, ready to post with the report; the draft holds its id.
 * One taken out before posting is let go at once; one already on the
 * report comes off when the edit is saved.
 */
export function PhotoField({
  turfId,
  photos,
  known,
  upload,
  left,
  getToken,
  onAdd,
  onRemove,
  onLeft,
}: {
  turfId: string;
  photos: DraftPhoto[];
  /** Whether uploads are on is known (GET /api/reviews/photos answered). */
  known: boolean;
  /** Uploads are on (the check is set up, not paused). */
  upload: boolean;
  /** Uploads left today. */
  left: number;
  getToken: () => Promise<TokenCheck>;
  onAdd: (p: DraftPhoto) => void;
  onRemove: (id: string) => void;
  onLeft: (n: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const room = REVIEW_PHOTOS.perReport - photos.length - pending.length;
  // A photo turned down: its reason comes into view (the field sits low on the sheet).
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [error]);

  // Previews are object URLs of the picked files: let them go with the sheet.
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const all = previews.current;
    return () => all.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const addOne = async (file: File) => {
    const key = ++seq.current;
    const preview = URL.createObjectURL(file);
    previews.current.add(preview);
    setPending((p) => [...p, { key, preview }]);
    const done = (message: string | null) => {
      setPending((p) => p.filter((x) => x.key !== key));
      URL.revokeObjectURL(preview);
      previews.current.delete(preview);
      if (message) setError(message);
    };
    let prepared;
    try {
      const { preparePhoto } = await import("@/lib/reviews/photoPrep");
      prepared = await preparePhoto(file);
    } catch (e) {
      return done(photoErrorText("bad", (e as { reason?: string }).reason ?? "unreadable"));
    }
    const t = await getToken();
    if (!("token" in t)) return done(photoErrorText("sign_in"));
    const a = await addPhoto(t.token, turfId, prepared.full, prepared.thumb);
    const b = a.body as PhotoAddResponse;
    if ("r" in b && b.r === "ok") {
      onAdd({ ...b.photo, at: Date.now() });
      onLeft(b.left);
      return done(null);
    }
    const err = "error" in b ? b : { error: "unavailable", problem: undefined };
    if (err.error === "limit") onLeft(0);
    done(photoErrorText(a.status === 0 ? null : err.error, err.problem));
  };

  const pick = (files: FileList | null) => {
    setError(null);
    const list = [...(files ?? [])];
    if (input.current) input.current.value = "";
    if (!list.length) return;
    const take = list.slice(0, Math.max(0, Math.min(room, left)));
    if (take.length < list.length) setError(left < list.length && left < room ? photoErrorText("limit") : `Up to ${REVIEW_PHOTOS.perReport} photos on a report.`);
    for (const f of take) void addOne(f);
  };

  const remove = async (p: DraftPhoto) => {
    setError(null);
    onRemove(p.id);
    // Not posted yet: let it go now. One on the report comes off with the save.
    if (p.at !== null) {
      const t = await getToken();
      if ("token" in t) void discardPhoto(t.token, p.id);
    }
  };

  const tile = "relative w-20 h-20 shrink-0 rounded-xl overflow-hidden bg-primary-100";
  return (
    <section className="mt-5">
      <p className="text-[14px] font-semibold text-primary-900">Photos from your game</p>
      <p className="text-[12px] text-primary-500 mb-2">Up to 3, of the pitch, the court or your game. They show on your report.</p>
      <ul className="flex flex-wrap gap-2" aria-label="Your photos">
        {photos.map((p, i) => (
          <li key={p.id} className={tile}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={reviewPhotoUrl(p.thumb)} alt={`Your photo ${i + 1}`} width={80} height={80} className="w-20 h-20 object-cover" />
            <button
              type="button"
              onClick={() => void remove(p)}
              aria-label={`Take photo ${i + 1} out`}
              className="press-tight absolute top-0 right-0 w-11 h-11 flex items-start justify-end p-1"
            >
              <span className="w-7 h-7 rounded-full bg-primary-900/80 text-white flex items-center justify-center">
                <X className="w-4 h-4" aria-hidden />
              </span>
            </button>
          </li>
        ))}
        {pending.map((p) => (
          <li key={p.key} className={tile} aria-label="Adding a photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.preview} alt="" width={80} height={80} className="w-20 h-20 object-cover opacity-50" />
            <span className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary-900" aria-hidden />
            </span>
          </li>
        ))}
        {room > 0 && upload && left > 0 && (
          <li>
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="press-tight w-20 h-20 rounded-xl border-2 border-dashed border-primary-300 text-primary-700 hover:border-accent-500 hover:text-accent-700 flex flex-col items-center justify-center gap-1 text-[12px] font-semibold"
            >
              <Camera className="w-5 h-5" aria-hidden />
              Add photo
            </button>
          </li>
        )}
      </ul>
      <input ref={input} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => pick(e.target.files)} />
      {pending.length > 0 && <p className="mt-1.5 text-[12px] text-primary-500" aria-live="polite">Checking your photo…</p>}
      {error && (
        <p ref={errorRef} role="alert" className="mt-1.5 scroll-mb-4 text-[12px] text-hot-600">
          {error}
        </p>
      )}
      {known && !upload && room > 0 && <p className="mt-1.5 text-[12px] text-primary-500">Adding photos is paused for now. Try again later.</p>}
      {upload && left === 0 && room > 0 && <p className="mt-1.5 text-[12px] text-primary-500">That&apos;s {REVIEW_PHOTOS.perDay} photos today. You can add more tomorrow.</p>}
    </section>
  );
}
