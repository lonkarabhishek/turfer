"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import Link from "next/link";
import { Camera, Check, Loader2, Minus, Plus, Trash2, Upload } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Sheet } from "./Sheet";
import { UserAvatar } from "./UserAvatar";
import {
  AVATAR_PRESETS,
  clampCrop,
  coverScale,
  maxZoom,
  photoErrorText,
  pictureKind,
  presetOf,
  presetPath,
  startCrop,
  zoomCrop,
  type AvatarPresetId,
  type Crop,
} from "@/lib/account/avatar";
import { choosePreset, chooseGooglePhoto, errorOf, getPhotoState, profileIn, removePhoto, uploadPhoto, type Answer } from "@/lib/account/client";
import { cropToFile, loadForCrop, PhotoError, releaseCanvas, type CropSource } from "@/lib/account/photoCrop";
import type { PhotoChangeResponse } from "@/lib/account/types";
import type { AppUser } from "@/types/user";

type PhotoState = { ready: boolean; upload: boolean; google: string | null };

const problemOf = (a: Answer<unknown>) => {
  const p = (a.body as { problem?: unknown } | null)?.problem;
  return typeof p === "string" ? p : null;
};

/**
 * The profile photo sheet (the Me tab): upload a photo (cropped to a
 * square here, checked on the server before it shows), "Use my Google
 * photo" for a Google sign-in, one of the drawn sports avatars, or back
 * to initials. Before the database has photos it says so and offers
 * nothing (lib/account/photoRoutes.ts GET).
 */
export function PhotoSheet({ user, onClose, onSaved }: { user: AppUser; onClose: () => void; onSaved: (text: string) => void }) {
  const { getToken, applyProfile } = useAuth();
  const [state, setState] = useState<PhotoState | "loading" | "error">("loading");
  // What is being saved: "upload", "google", "remove" or an avatar id.
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  // The check turned the last photo down: the crop step then leads with another photo.
  const [refused, setRefused] = useState(false);
  const [picked, setPicked] = useState<{ file: File; n: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const current = user.profile_image_url ?? null;
  const kind = pictureKind(current);
  const currentPreset = presetOf(current);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const tok = await getToken();
      if (!alive) return;
      if (!("token" in tok)) return setState("error");
      const a = await getPhotoState(tok.token);
      if (!alive) return;
      const b = a.body as Partial<PhotoState>;
      setState(typeof b.ready === "boolean" ? { ready: b.ready, upload: b.upload === true, google: typeof b.google === "string" ? b.google : null } : "error");
    })();
    return () => {
      alive = false;
    };
  }, [getToken]);

  /** One change: the new profile shown everywhere at once, then the sheet closes. */
  const save = async (key: string, send: (token: string) => Promise<Answer<PhotoChangeResponse>>, done: string): Promise<boolean> => {
    setError("");
    setRefused(false);
    setBusy(key);
    try {
      const tok = await getToken();
      if (!("token" in tok)) {
        setError(photoErrorText("unknown" in tok ? null : "sign_in"));
        return false;
      }
      const a = await send(tok.token);
      const p = profileIn(a);
      if (p && !errorOf(a)) {
        applyProfile(p);
        onSaved(done);
        onClose();
        return true;
      }
      setError(photoErrorText(errorOf(a), problemOf(a)));
      setRefused(errorOf(a) === "refused");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const ready = state !== "loading" && state !== "error" && state.ready;
  const canUpload = ready && state.upload;
  const google = ready ? state.google : null;

  // The gallery, from the sheet or (after a refusal) from the crop step; each photo gets a fresh crop.
  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) {
          setError("");
          setRefused(false);
          setPicked((p) => ({ file: f, n: (p?.n ?? 0) + 1 }));
        }
      }}
    />
  );

  if (picked) {
    return (
      <Sheet labelledBy="photo-crop-title" onClose={() => (busy ? undefined : setPicked(null))} locked={!!busy}>
        <CropStep
          key={picked.n}
          file={picked.file}
          busy={busy === "upload"}
          error={error}
          refused={refused}
          onCancel={() => {
            setError("");
            setRefused(false);
            setPicked(null);
          }}
          onAvatar={() => setPicked(null)}
          onPickAnother={() => fileRef.current?.click()}
          onFail={(text) => {
            setError(text);
            setPicked(null);
          }}
          onUse={(blob) => void save("upload", (t) => uploadPhoto(t, blob), "Photo updated")}
        />
        {fileInput}
      </Sheet>
    );
  }

  return (
    <Sheet labelledBy="photo-sheet-title" describedBy="photo-sheet-note" onClose={onClose} locked={!!busy}>
      <h2 id="photo-sheet-title" className="font-display text-2xl text-primary-900 leading-tight">
        Profile photo
      </h2>
      <p id="photo-sheet-note" className="mt-1 text-[14px] text-primary-500">
        It shows next to your name on your profile and on games you host or join.
      </p>

      <div className="mt-5 flex items-center gap-4">
        <UserAvatar src={current} name={user.name} size={72} eager className="ring-4 ring-accent-50" />
        <div className="min-w-0 text-[14px] text-primary-600">
          {kind === "preset"
            ? `Avatar: ${AVATAR_PRESETS.find((p) => p.id === currentPreset)?.label ?? "sports"}`
            : kind === "google"
              ? "Your Google photo"
              : current
                ? "Your photo"
                : "Your initials, for now"}
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-hot-500/10 px-3 py-2.5 text-[14px] font-medium text-hot-600" role="alert">
          {error}
        </p>
      )}

      {state === "loading" && (
        <p className="mt-6 inline-flex items-center gap-2 text-[14px] text-primary-500">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Loading…
        </p>
      )}
      {state === "error" && <p className="mt-6 text-[14px] text-primary-600">{photoErrorText(null)}</p>}
      {state !== "loading" && state !== "error" && !state.ready && (
        <p className="mt-6 rounded-xl bg-primary-50 px-3 py-2.5 text-[14px] text-primary-700">
          Profile photos aren&rsquo;t switched on yet. Your initials show for now.
        </p>
      )}

      {ready && (
        <>
          <div className="mt-5 space-y-2.5">
            {canUpload && (
              <>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={!!busy}
                  className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-full bg-primary-900 text-white text-[15px] font-semibold disabled:opacity-50 focus-neon"
                >
                  <Upload className="w-4 h-4" aria-hidden />
                  {kind === "upload" ? "Upload a new photo" : "Upload a photo"}
                </button>
                {fileInput}
              </>
            )}
            {google && current !== google && (
              <button
                type="button"
                onClick={() => void save("google", chooseGooglePhoto, "Using your Google photo")}
                disabled={!!busy}
                className="w-full flex items-center justify-center gap-2.5 min-h-[48px] rounded-full border border-primary-200 bg-white text-[15px] font-semibold text-primary-900 hover:border-primary-300 disabled:opacity-50 focus-neon"
              >
                {busy === "google" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <UserAvatar src={google} name={user.name} size={24} />}
                Use my Google photo
              </button>
            )}
          </div>
          {ready && !canUpload && (
            <p className="mt-3 text-[13px] text-primary-500">Photo uploads are paused for a bit. You can pick an avatar.</p>
          )}

          <h3 className="mt-6 text-[13px] font-semibold text-primary-500">Or pick an avatar</h3>
          <div className="mt-2.5 grid grid-cols-4 gap-3" role="group" aria-label="Avatars">
            {AVATAR_PRESETS.map((p) => {
              const on = currentPreset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-label={`${p.label} avatar`}
                  aria-pressed={on}
                  disabled={!!busy}
                  onClick={() => (on ? onClose() : void save(p.id, (t) => choosePreset(t, p.id as AvatarPresetId), `${p.label} avatar set`))}
                  className={`relative aspect-square rounded-full transition-transform active:scale-95 disabled:opacity-60 focus-neon ${
                    on ? "ring-2 ring-accent-500 ring-offset-2" : "hover:scale-105"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={presetPath(p.id)} alt="" width={64} height={64} loading="lazy" decoding="async" className="w-full h-full rounded-full" />
                  {busy === p.id && (
                    <span className="absolute inset-0 grid place-items-center rounded-full bg-white/60">
                      <Loader2 className="w-5 h-5 animate-spin text-primary-900" aria-hidden />
                    </span>
                  )}
                  {on && (
                    <span className="absolute -bottom-0.5 -right-0.5 grid place-items-center w-5 h-5 rounded-full bg-accent-500 text-white ring-2 ring-white" aria-hidden>
                      <Check className="w-3 h-3" strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {current && (
            <button
              type="button"
              onClick={() => void save("remove", removePhoto, kind === "preset" ? "Avatar removed" : "Photo removed")}
              disabled={!!busy}
              className="mt-5 inline-flex items-center gap-1.5 min-h-[44px] text-[14px] font-semibold text-hot-600 disabled:opacity-50"
            >
              {busy === "remove" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Trash2 className="w-4 h-4" aria-hidden />}
              {kind === "preset" ? "Remove avatar" : "Remove photo"}
            </button>
          )}
          <p className="mt-3 text-[12px] leading-snug text-primary-500">
            Anyone can see your picture. Photos are checked automatically before they show.{" "}
            <Link href="/privacy#photo" className="underline underline-offset-2">
              How we handle photos
            </Link>
          </p>
        </>
      )}

      <button type="button" onClick={onClose} disabled={!!busy} className="mt-5 w-full min-h-[44px] rounded-full text-[15px] font-semibold text-primary-700 hover:bg-primary-50 disabled:opacity-50">
        Close
      </button>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* The square crop                                                     */
/* ------------------------------------------------------------------ */

/** The crop frame's side: 280 px, less on a narrow phone. */
const frameSide = () => Math.max(200, Math.min(280, (typeof window === "undefined" ? 360 : window.innerWidth) - 80));

function CropStep({
  file,
  busy,
  error,
  refused,
  onCancel,
  onAvatar,
  onPickAnother,
  onFail,
  onUse,
}: {
  file: File;
  busy: boolean;
  error: string;
  /** The check turned this photo down: lead with another photo or an avatar; a new crop is still allowed. */
  refused: boolean;
  onCancel: () => void;
  /** Back to the sheet's avatars, the reason still showing. */
  onAvatar: () => void;
  onPickAnother: () => void;
  onFail: (text: string) => void;
  onUse: (photo: Blob) => void;
}) {
  const [frame] = useState(frameSide);
  const [src, setSrc] = useState<CropSource | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [making, setMaking] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const failRef = useRef(onFail);
  useEffect(() => {
    failRef.current = onFail;
  });

  // Read the photo once; its canvas is shown as it is (no second copy) and freed when the step closes.
  useEffect(() => {
    let alive = true;
    let loaded: CropSource | null = null;
    loadForCrop(file).then(
      (s) => {
        if (!alive) return releaseCanvas(s.canvas);
        loaded = s;
        setSrc(s);
        setCrop(startCrop(s.w, s.h, frame));
      },
      (e) => {
        if (alive) failRef.current(photoErrorText("bad", e instanceof PhotoError ? e.reason : "unreadable"));
      },
    );
    return () => {
      alive = false;
      releaseCanvas(loaded?.canvas);
    };
  }, [file, frame]);

  useLayoutEffect(() => {
    const h = holder.current;
    if (!h || !src) return;
    src.canvas.style.width = "100%";
    src.canvas.style.height = "100%";
    src.canvas.style.display = "block";
    h.appendChild(src.canvas);
    return () => {
      if (src.canvas.parentNode === h) h.removeChild(src.canvas);
    };
  }, [src]);

  const cover = src ? coverScale(src.w, src.h, frame) : 1;
  const zoom = crop ? crop.scale / cover : 1;
  const zMax = src ? maxZoom(src.w, src.h) : 1;

  const zoomTo = useCallback(
    (z: number, cx?: number, cy?: number) => {
      if (!src) return;
      setCrop((c) => (c ? zoomCrop(c, Math.min(zMax, Math.max(1, z)), src.w, src.h, frame, cx, cy) : c));
    },
    [src, frame, zMax],
  );
  const moveBy = (dx: number, dy: number) => src && setCrop((c) => (c ? clampCrop({ ...c, x: c.x + dx, y: c.y + dy }, src.w, src.h, frame) : c));

  // A wheel or trackpad zooms (a listener that can stop the sheet scrolling).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setCrop((c) => {
        if (!c || !src) return c;
        const z = c.scale / coverScale(src.w, src.h, frame);
        return zoomCrop(c, Math.min(zMax, Math.max(1, z * Math.exp(-e.deltaY * 0.002))), src.w, src.h, frame, e.clientX - r.left, e.clientY - r.top);
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [src, frame, zMax]);

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const all = pointers.current;
    const before = all.get(e.pointerId);
    if (!before || !src) return;
    const now = { x: e.clientX, y: e.clientY };
    if (all.size === 1) {
      all.set(e.pointerId, now);
      moveBy(now.x - before.x, now.y - before.y);
      return;
    }
    // Two fingers: pinch about their middle.
    const other = [...all.entries()].find(([id]) => id !== e.pointerId)?.[1];
    all.set(e.pointerId, now);
    if (!other) return;
    const d0 = Math.hypot(before.x - other.x, before.y - other.y);
    const d1 = Math.hypot(now.x - other.x, now.y - other.y);
    if (d0 < 1) return;
    const r = e.currentTarget.getBoundingClientRect();
    zoomTo(zoom * (d1 / d0), (now.x + other.x) / 2 - r.left, (now.y + other.y) / 2 - r.top);
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 32 : 8;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) {
      e.preventDefault();
      moveBy(...moves[e.key]);
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomTo(zoom + 0.1);
    } else if (e.key === "-") {
      e.preventDefault();
      zoomTo(zoom - 0.1);
    }
  };

  const use = async () => {
    if (!src || !crop) return;
    setMaking(true);
    try {
      onUse(await cropToFile(src, crop, frame));
    } catch (e) {
      onFail(photoErrorText("bad", e instanceof PhotoError ? e.reason : "unreadable"));
    } finally {
      setMaking(false);
    }
  };

  const working = busy || making;
  return (
    <>
      <h2 id="photo-crop-title" className="font-display text-2xl text-primary-900 leading-tight">
        Move and zoom
      </h2>
      <p className="mt-1 text-[14px] text-primary-500">Drag the photo so your face sits in the circle.</p>

      <div
        ref={box}
        role="group"
        tabIndex={0}
        aria-label="Photo crop. Drag or use the arrow keys to move it; use the zoom slider, plus or minus to zoom."
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        className="relative mx-auto mt-4 overflow-hidden rounded-2xl bg-primary-900 touch-none select-none cursor-grab active:cursor-grabbing focus-neon"
        style={{ width: frame, height: frame }}
      >
        {src && crop ? (
          <div
            ref={holder}
            className="absolute left-0 top-0 origin-top-left will-change-transform"
            style={{ width: src.w * crop.scale, height: src.h * crop.scale, transform: `translate3d(${crop.x}px, ${crop.y}px, 0)` }}
          />
        ) : (
          <span className="absolute inset-0 grid place-items-center">
            <Loader2 className="w-6 h-6 animate-spin text-white/80" aria-hidden />
          </span>
        )}
        {/* The circle that shows: the rest dimmed. */}
        <span className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: "0 0 0 9999px rgba(17,17,19,0.55)" }} aria-hidden />
        <span className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/90" aria-hidden />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={() => zoomTo(zoom - 0.25)} disabled={!src || working} aria-label="Zoom out" className="grid place-items-center w-11 h-11 rounded-full border border-primary-200 disabled:opacity-40">
          <Minus className="w-4 h-4" aria-hidden />
        </button>
        <input
          type="range"
          min={1}
          max={zMax}
          step={0.01}
          value={zoom}
          disabled={!src || working || zMax <= 1}
          onChange={(e) => zoomTo(Number(e.target.value))}
          aria-label="Zoom"
          className="flex-1 accent-[#16A34A]"
        />
        <button type="button" onClick={() => zoomTo(zoom + 0.25)} disabled={!src || working} aria-label="Zoom in" className="grid place-items-center w-11 h-11 rounded-full border border-primary-200 disabled:opacity-40">
          <Plus className="w-4 h-4" aria-hidden />
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-hot-500/10 px-3 py-2.5 text-[14px] font-medium text-hot-600" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <p className="mt-3 inline-flex items-center gap-2 text-[14px] text-primary-600" role="status">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Checking your photo…
        </p>
      )}

      {refused ? (
        // What the message offers, first; sending this photo again only helps after a new crop.
        <div className="mt-5 space-y-3">
          <button
            type="button"
            onClick={onPickAnother}
            disabled={working}
            className="w-full inline-flex items-center justify-center gap-2 min-h-[48px] rounded-full bg-accent-500 text-white text-[15px] font-semibold disabled:opacity-50 focus-neon"
          >
            <Upload className="w-4 h-4" aria-hidden />
            Pick another photo
          </button>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={onAvatar} disabled={working} className="min-h-[44px] rounded-full border border-primary-200 text-[14px] font-semibold text-primary-800 disabled:opacity-50 focus-neon">
              Pick an avatar
            </button>
            <button
              type="button"
              onClick={() => void use()}
              disabled={!src || working}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-full text-[14px] font-semibold text-primary-700 hover:bg-primary-50 disabled:opacity-50 focus-neon"
            >
              {working && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
              Try this crop
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} disabled={working} className="min-h-[48px] rounded-full border border-primary-200 text-[15px] font-semibold text-primary-800 disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void use()}
            disabled={!src || working}
            className="inline-flex items-center justify-center gap-2 min-h-[48px] rounded-full bg-accent-500 text-white text-[15px] font-semibold disabled:opacity-50 focus-neon"
          >
            {working ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Camera className="w-4 h-4" aria-hidden />}
            Use photo
          </button>
        </div>
      )}
    </>
  );
}
