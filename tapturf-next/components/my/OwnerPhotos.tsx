"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, Plus, RotateCw } from "lucide-react";
import { CONTACT_EMAIL, CONTACT_MAILTO } from "@/lib/contact";
import { imageUrlForCard, normalizeImageUrl } from "@/lib/utils/images";
import { PHOTO, ownerPhotoMessage, photoCountLine, photoTiles, type PhotoTile } from "@/lib/my/photoMath";
import { addOwnerPhotos, loadOwnerPhotos, makeCover, removeOwnerPhoto, type AddPhase, type AddStep, type FileState } from "@/lib/my/photos";
import type { AddResult, OwnerPhoto, OwnerPhotoList } from "@/lib/my/photoTypes";

type Pending = { key: string; file: File; preview: string | null; state: FileState; reason?: string };
type Note = { text: string; tone: "ok" | "error" };

const BTN = "inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-full text-[14px] font-semibold cursor-pointer disabled:opacity-50";
const plural = (n: number) => (n === 1 ? "photo" : "photos");

type Phase = { phase: AddPhase; done: number; total: number };

/** What the owner reads after a batch. */
function resultNote(r: AddResult): Note | null {
  const parts: string[] = [];
  const shown = r.live;
  if (shown > 0) parts.push(`${shown} ${plural(shown)} added. ${shown === 1 ? "It shows" : "They show"} on your page within a minute.`);
  if (r.waiting > 0) parts.push(`${r.waiting} ${plural(r.waiting)} still being checked. ${r.waiting === 1 ? "It goes" : "They go"} on your page in a few minutes.`);
  if (r.held === 1) parts.push("1 photo kept off your page: it looks like a poster, price list or screenshot. Players want to see the ground. Put prices in Edit your listing below.");
  else if (r.held > 1) parts.push(`${r.held} photos kept off your page: they look like posters, price lists or screenshots. Players want to see the ground. Put prices in Edit your listing below.`);
  if (r.duplicates === 1) parts.push(ownerPhotoMessage("duplicate"));
  else if (r.duplicates > 1) parts.push(`You’ve already added ${r.duplicates} of these photos.`);
  if (r.error) parts.push(ownerPhotoMessage(r.error, undefined, r.left));
  else {
    const seen = new Set<string>();
    for (const f of r.failed) {
      const m = ownerPhotoMessage(f.reason, f.name);
      if (seen.has(m) || seen.size >= 2) continue;
      seen.add(m);
      parts.push(m);
    }
  }
  if (parts.length === 0) return null;
  return { text: parts.join(" "), tone: shown + r.waiting > 0 ? "ok" : "error" };
}

/**
 * The Photos section of /my/turf/<id>: the turf's photos as players see
 * them, adding photos from the phone, Make cover, and Remove for photos
 * owners added. onCount reports how many photos the public page shows.
 */
export function OwnerPhotos({ turfId, turfName, onChanged, onCount }: { turfId: string; turfName: string; onChanged: () => void; onCount?: (visible: number) => void }) {
  const [list, setList] = useState<OwnerPhotoList | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const pendingRef = useRef<Pending[]>([]);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [broken, setBroken] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    try {
      const r = await loadOwnerPhotos(turfId);
      if ("error" in r) {
        setLoadFailed(true);
        return;
      }
      setList(r);
      setLoadFailed(false);
      onCount?.(photoTiles(r).visible);
    } catch {
      setLoadFailed(true);
    }
  }, [turfId, onCount]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  // Photos still being checked: look again every 30 seconds, ten times at most.
  const polls = useRef(0);
  const checkingCount = list ? list.mine.filter((m) => m.status === "checking").length : 0;
  useEffect(() => {
    if (checkingCount === 0 || busy || polls.current >= 10) return;
    const t = setTimeout(() => {
      polls.current++;
      void load();
    }, 30_000);
    return () => clearTimeout(t);
  }, [checkingCount, busy, list, load]);

  // Previews are object URLs: free them when the section goes.
  useEffect(() => () => pendingRef.current.forEach((p) => p.preview && URL.revokeObjectURL(p.preview)), []);

  const updatePending = (fn: (p: Pending[]) => Pending[]) => {
    pendingRef.current = fn(pendingRef.current);
    setPending(pendingRef.current);
  };

  const grid = list ? photoTiles(list) : null;
  const sel = grid?.tiles.find((t) => t.key === selected) ?? null;
  const mailto = (subject: string) => `${CONTACT_MAILTO}?subject=${encodeURIComponent(subject)}`;

  const upload = async (files: File[], retryKey?: string) => {
    if (busy || files.length === 0) return;
    if (files.length > PHOTO.maxBatch) {
      setNote({ text: ownerPhotoMessage("batch"), tone: "error" });
      return;
    }
    const stamp = Date.now();
    const batch: Pending[] = files.map((file, i) => ({ key: `${stamp}-${i}`, file, preview: null, state: "preparing" }));
    updatePending((p) => {
      const old = p.find((x) => x.key === retryKey);
      if (old?.preview) URL.revokeObjectURL(old.preview);
      return [...p.filter((x) => x.key !== retryKey), ...batch];
    });
    setBusy(true);
    setNote(null);
    setSelected(null);
    setConfirming(null);
    const onStep = (s: AddStep) => {
      if (s.kind === "phase") return setPhase({ phase: s.phase, done: s.done, total: s.total });
      const key = batch[s.index]?.key;
      updatePending((p) =>
        p.map((x) => {
          if (x.key !== key) return x;
          if (s.preview && x.preview) URL.revokeObjectURL(x.preview);
          return { ...x, state: s.state, preview: s.preview ?? x.preview, reason: s.reason };
        }),
      );
    };
    let res: AddResult;
    try {
      res = await addOwnerPhotos(turfId, files, onStep);
    } catch {
      res = { added: 0, live: 0, held: 0, waiting: 0, duplicates: 0, failed: [], error: "network" };
    }
    // The new photos into the grid first, then their placeholders out.
    if (res.added > 0) await load();
    // Keep the tiles a connection problem stopped (tap to retry); the rest
    // are on the page, or the message below says why not.
    updatePending((p) =>
      p.filter((x) => {
        if (!batch.some((b) => b.key === x.key) || (x.state === "failed" && x.reason === "network")) return true;
        if (x.preview) URL.revokeObjectURL(x.preview);
        return false;
      }),
    );
    setBusy(false);
    setPhase(null);
    setNote(resultNote(res));
    if (res.added > 0) onChanged();
  };

  const cover = async (t: PhotoTile) => {
    setBusy(true);
    setNote(null);
    const r = await makeCover(turfId, t.raw);
    setBusy(false);
    if ("error" in r) return setNote({ text: ownerPhotoMessage(r.error), tone: "error" });
    setNote({ text: "Done. This is now the first photo players see.", tone: "ok" });
    await load();
    onChanged();
  };

  const remove = async (id: string) => {
    setBusy(true);
    setNote(null);
    const r = await removeOwnerPhoto(turfId, id);
    setBusy(false);
    setConfirming(null);
    if ("error" in r) return setNote({ text: r.error === "network" ? "Couldn’t remove it. Check your connection and try again." : ownerPhotoMessage(r.error), tone: "error" });
    setSelected(null);
    setNote({ text: "Removed.", tone: "ok" });
    await load();
    onChanged();
  };

  // The tile is a label around the file input (iOS opens the picker most reliably that way).
  const pick = (e: React.MouseEvent) => {
    if (busy) return e.preventDefault();
    if (grid && grid.mineLive + grid.checking.length >= (list?.maxMine ?? PHOTO.maxLive)) {
      e.preventDefault();
      setNote({ text: ownerPhotoMessage("too_many"), tone: "error" });
    }
  };

  const confirmRow = (id: string) => (
    <div className="flex flex-wrap items-center gap-2">
      <p className="w-full text-[14px] font-semibold text-primary-900">Remove this photo from your page?</p>
      <button type="button" disabled={busy} onClick={() => void remove(id)} className={`${BTN} bg-red-600 hover:bg-red-700 text-white`}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Remove
      </button>
      <button type="button" disabled={busy} onClick={() => setConfirming(null)} className={`${BTN} bg-primary-100 hover:bg-primary-200 text-primary-900`}>
        Keep it
      </button>
    </div>
  );

  return (
    <>
      <h2 className="font-display text-[22px] text-primary-900">Photos</h2>
      <p className="mt-1 text-[14px] text-primary-500">Players look at photos before they call. Add clear photos of your ground: in daylight, under lights, and from a corner so the whole turf shows.</p>

      {loadFailed && !list ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-[14px] text-red-700">Couldn&rsquo;t load your photos. Check your connection and try again.</p>
          <button type="button" onClick={() => void load()} className={`${BTN} bg-primary-100 hover:bg-primary-200 text-primary-900`}>
            <RotateCw className="w-4 h-4" /> Try again
          </button>
        </div>
      ) : !grid ? (
        <p className="mt-3 text-[14px] text-primary-500 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading your photos…</p>
      ) : (
        <>
          <p className="mt-2 text-[13px] text-primary-500">{photoCountLine(grid.visible, grid.mineLive)}</p>

          <div className="mt-3 grid grid-cols-3 md:grid-cols-4 gap-2">
            <label
              onClick={pick}
              aria-disabled={busy}
              className={`aspect-[4/3] rounded-xl border-2 border-dashed border-primary-300 hover:border-primary-500 focus-within:ring-2 focus-within:ring-accent-500 bg-primary-50 text-primary-700 flex flex-col items-center justify-center gap-1 text-[13px] font-semibold cursor-pointer ${busy ? "opacity-50" : ""}`}
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              Add photos
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={busy}
                className="sr-only"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  void upload(files);
                }}
              />
            </label>

            {pending.map((p) => (
              <PendingTile key={p.key} p={p} phase={phase} onRetry={() => void upload([p.file], p.key)} disabled={busy} />
            ))}

            {grid.checking.map((c) => (
              <CheckingTile key={c.id} url={c.url} />
            ))}

            {grid.tiles.map((t) => (
              <button
                key={t.key}
                type="button"
                aria-pressed={selected === t.key}
                aria-label={`${t.cover ? "Cover photo" : "Photo"}${t.hidden ? ", hidden" : ""}${t.mine ? ", added by you" : ""}`}
                onClick={() => {
                  setSelected(selected === t.key ? null : t.key);
                  setConfirming(null);
                }}
                className={`relative aspect-[4/3] rounded-xl overflow-hidden bg-primary-100 cursor-pointer ${selected === t.key ? "ring-2 ring-accent-500 ring-offset-2" : ""}`}
              >
                {broken.has(t.key) ? (
                  <span className="absolute inset-0 flex items-center justify-center text-primary-400"><Camera className="w-6 h-6" /></span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrlForCard(t.src)}
                    alt=""
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    onError={() => setBroken((b) => new Set(b).add(t.key))}
                    className={`w-full h-full object-cover ${t.hidden ? "opacity-40" : ""}`}
                  />
                )}
                {t.cover && <span className="absolute top-1.5 left-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-primary-900">Cover</span>}
                {t.hidden && <span className="absolute bottom-1.5 left-1.5 rounded-full bg-primary-900/80 px-2 py-0.5 text-[11px] font-semibold text-white">Hidden</span>}
              </button>
            ))}
          </div>

          <p role="status" aria-live="polite" className={`text-[14px] leading-snug ${note ? "mt-3" : ""} ${note?.tone === "error" ? "text-red-700" : "text-primary-800"}`}>
            {note?.text ?? ""}
          </p>

          {sel && (
            <div className="mt-3 rounded-2xl border border-primary-200 bg-white p-3 space-y-3">
              {sel.hidden && <p className="text-[13px] text-primary-600">Hidden from your page{sel.note ? `: ${sel.note}` : ""}.</p>}
              {confirming && confirming === sel.mine ? (
                confirmRow(sel.mine)
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {!sel.hidden && !(sel.cover && sel.first) && (
                    <button type="button" disabled={busy} onClick={() => void cover(sel)} className={`${BTN} bg-primary-900 hover:bg-primary-800 text-white`}>
                      Make cover
                    </button>
                  )}
                  {sel.cover && sel.first && <p className="text-[14px] text-primary-600 inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-accent-600" /> The first photo players see.</p>}
                  {sel.mine && (
                    <button type="button" disabled={busy} onClick={() => setConfirming(sel.mine)} className={`${BTN} bg-primary-100 hover:bg-primary-200 text-red-700`}>
                      Remove
                    </button>
                  )}
                </div>
              )}
              {!sel.mine && (
                <p className="text-[13px] text-primary-500">
                  Added by TapTurf from public listings. To take it down,{" "}
                  <a href={mailto(`Remove a photo from ${turfName} (${turfId})`)} className="font-semibold text-accent-700 underline underline-offset-2">email us</a>.
                </p>
              )}
            </div>
          )}

          {grid.held.length > 0 && (
            <div className="mt-5">
              <h3 className="text-[13px] font-semibold text-primary-500">Kept off your page</h3>
              <ul className="mt-2 space-y-2">
                {grid.held.map((h) => (
                  <HeldRow key={h.id} h={h} busy={busy} confirming={confirming === h.id} onAsk={() => setConfirming(h.id)} confirm={confirmRow(h.id)} />
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <p className="mt-4 text-[12px] text-primary-400">
        We remove location details from your photos before they go up. Trouble adding photos? Email them to{" "}
        <a href={mailto(`Photos for ${turfName} (${turfId})`)} className="underline underline-offset-2">{CONTACT_EMAIL}</a>.
      </p>
    </>
  );
}

function tileLabel(p: Pending, phase: Phase | null): [string, string?] {
  switch (p.state) {
    case "failed":
      return p.reason === "network" ? ["Didn’t upload.", "Tap to retry"] : ["Can’t use this one"];
    case "duplicate":
      return ["Already added"];
    case "uploading":
      return phase?.phase === "uploading" ? ["Uploading", `${Math.min(phase.done + 1, phase.total)} of ${phase.total}…`] : ["Uploading…"];
    case "uploaded":
      return ["Uploaded"];
    case "checking":
    case "done":
      return ["Checking…"];
    case "ready":
      return phase?.phase === "preparing" ? ["Getting ready…"] : ["Waiting…"];
    default:
      return ["Getting ready…"];
  }
}

function PendingTile({ p, phase, onRetry, disabled }: { p: Pending; phase: Phase | null; onRetry: () => void; disabled: boolean }) {
  // Only a connection problem is worth another try; the message says what was wrong with the rest.
  const retry = p.state === "failed" && p.reason === "network";
  const failed = p.state === "failed";
  const done = p.state === "uploaded";
  const [line1, line2] = tileLabel(p, phase);
  const body = (
    <>
      {p.preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.preview} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <span className="absolute inset-0 bg-primary-100" />
      )}
      <span className={`absolute inset-0 flex flex-col items-center justify-center gap-1 px-1.5 text-center text-[12px] font-semibold leading-tight ${failed ? "bg-red-900/70 text-white" : "bg-primary-900/55 text-white"}`}>
        {retry ? <RotateCw className="w-4 h-4" /> : failed || p.state === "duplicate" ? null : done ? <Check className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
        <span>{line1}</span>
        {line2 && <span className="font-normal">{line2}</span>}
      </span>
    </>
  );
  if (retry)
    return (
      <button type="button" onClick={onRetry} disabled={disabled} className="relative aspect-[4/3] rounded-xl overflow-hidden cursor-pointer disabled:opacity-60">
        {body}
      </button>
    );
  return <div className="relative aspect-[4/3] rounded-xl overflow-hidden" aria-busy="true">{body}</div>;
}

/** A photo uploaded and waiting for the check: not on the page yet. */
function CheckingTile({ url }: { url: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-primary-100" aria-label="Photo being checked">
      {!broken && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrlForCard(url)} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)} className="absolute inset-0 w-full h-full object-cover" />
      )}
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-1.5 text-center text-[12px] font-semibold leading-tight bg-primary-900/55 text-white">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Checking…</span>
        <span className="font-normal">Shows in a few minutes</span>
      </span>
    </div>
  );
}

function HeldRow({ h, busy, confirming, onAsk, confirm }: { h: OwnerPhoto; busy: boolean; confirming: boolean; onAsk: () => void; confirm: React.ReactNode }) {
  const [broken, setBroken] = useState(false);
  return (
    <li className="rounded-2xl border border-primary-200 bg-white p-3">
      <div className="flex items-center gap-3">
        <span className="relative w-16 h-12 shrink-0 rounded-lg overflow-hidden bg-primary-100">
          {broken ? (
            <span className="absolute inset-0 flex items-center justify-center text-primary-400"><Camera className="w-4 h-4" /></span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrlForCard(normalizeImageUrl(h.url))} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)} className="w-full h-full object-cover opacity-60" />
          )}
        </span>
        <p className="flex-1 min-w-0 text-[13px] text-primary-600 leading-snug">{h.note ?? "This doesn’t look like a photo of your ground."}</p>
        {!confirming && (
          <button type="button" disabled={busy} onClick={onAsk} className={`${BTN} bg-primary-100 hover:bg-primary-200 text-red-700 shrink-0`}>
            Remove
          </button>
        )}
      </div>
      {confirming && <div className="mt-3">{confirm}</div>}
    </li>
  );
}
