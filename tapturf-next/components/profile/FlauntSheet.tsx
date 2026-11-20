"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { Check, Download, Link2, Loader2, RefreshCw, Share2, X } from "lucide-react";
import { Sheet } from "@/components/account/Sheet";
import { gaEvent } from "@/lib/analytics/ga";
import { medalStoryFile, medalStoryPath } from "@/lib/og/medalStoryUrl";
import { FLAUNT_COPY as C, FLAUNT_LINKS, flauntLink, flauntState, leadsWithShare } from "@/lib/profile/flaunt";

/**
 * The sheet "Flaunt my medals" opens (FlauntMedals.tsx): a preview of the
 * player's story picture and the ways to post it.
 *
 * - The picture (GET /api/og/medals/<username>, which redirects to its
 *   current version) is fetched once when the sheet opens and kept as a
 *   File, so the tap on Share calls navigator.share at once: iOS Safari
 *   forgets the tap across an await, and a share after one is refused.
 * - Share hands that file to the phone's share sheet (asked first with
 *   navigator.canShare), where the player picks Instagram, then Story.
 *   No link on the web opens Instagram's story editor; the sheet says
 *   only what happens. Only the file is shared: with a text or a link
 *   beside it some apps take the text and drop the picture.
 * - Everywhere, and first on a desktop: Save image (a download of the
 *   same file) and Copy my profile link, for Instagram's Link sticker.
 * - The picture is served only for a public profile. Without a username,
 *   or with "Let others find and tag me" off, the sheet says what to turn
 *   on and links to it instead of asking for a picture that is not there.
 * - Nothing is stored and nothing is sent anywhere but the one read of
 *   the picture from TapTurf; open, share, save and copy are counted with
 *   gaEvent (only with consent).
 */

type Pic = { state: "loading" } | { state: "ready"; file: File; url: string; share: boolean } | { state: "gone" } | { state: "failed" };

const PRIMARY = "inline-flex w-full items-center justify-center gap-2 min-h-[48px] rounded-full bg-primary-900 px-5 text-[15px] font-semibold text-white hover:bg-primary-800 transition-colors cursor-pointer touch-manipulation focus-neon";
const SECOND = "inline-flex flex-1 items-center justify-center gap-2 min-h-[44px] rounded-full border border-primary-200 bg-white px-4 text-[14px] font-semibold text-primary-800 hover:border-primary-400 transition-colors cursor-pointer touch-manipulation whitespace-nowrap focus-neon";

/** Whether this browser, on this device, can hand `file` to a share sheet worth leading with. */
function sharesFiles(file: File): boolean {
  try {
    const canShareFile = typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
    return leadsWithShare({ canShareFile, coarsePointer: window.matchMedia("(pointer: coarse)").matches });
  } catch {
    return false;
  }
}

export function FlauntSheet({ user, from, count, onClose }: { user: { username?: string; taggable?: boolean }; from: "passport" | "profile"; count: number; onClose: () => void }) {
  const uid = useId();
  const state = flauntState(user);
  const username = state === "ok" ? (user.username ?? "") : "";
  const [pic, setPic] = useState<Pic>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [note, setNote] = useState<"copied" | "copy_failed" | "share_failed" | null>(null);

  // The picture, once, as a file ready to share.
  useEffect(() => {
    if (!username) return;
    const stop = new AbortController();
    let url: string | null = null;
    void (async () => {
      try {
        const res = await fetch(medalStoryPath(username), { signal: stop.signal });
        if (res.status === 404) return setPic({ state: "gone" });
        if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/png")) return setPic({ state: "failed" });
        const file = new File([await res.blob()], medalStoryFile(username), { type: "image/png" });
        if (stop.signal.aborted) return;
        url = URL.createObjectURL(file);
        setPic({ state: "ready", file, url, share: sharesFiles(file) });
      } catch {
        if (!stop.signal.aborted) setPic({ state: "failed" });
      }
    })();
    return () => {
      stop.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [username, attempt]);

  const ga = (name: string) => gaEvent(name, { from, medals: count });

  // No await before navigator.share: the tap must still count as the player's own.
  const share = () => {
    if (pic.state !== "ready") return;
    ga("medal_story_share");
    setNote(null);
    try {
      navigator.share({ files: [pic.file] }).catch((e: unknown) => {
        // They closed the share sheet: nothing to say.
        if ((e as { name?: string } | null)?.name !== "AbortError") setNote("share_failed");
      });
    } catch {
      setNote("share_failed");
    }
  };

  const link = username ? flauntLink(window.location.origin, username) : "";
  const copy = async () => {
    ga("medal_story_copy_link");
    try {
      await navigator.clipboard.writeText(link);
      setNote("copied");
    } catch {
      setNote("copy_failed");
    }
  };

  const head = (title: string) => (
    <>
      <button
        type="button"
        onClick={onClose}
        aria-label={C.close}
        className="absolute right-2 top-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-primary-500 hover:bg-primary-100 focus-neon cursor-pointer"
      >
        <X className="h-5 w-5" aria-hidden />
      </button>
      <h2 id={`${uid}-title`} className="pr-10 font-display text-2xl leading-tight text-primary-900 outline-none">
        {title}
      </h2>
    </>
  );

  // No public profile to make it from: what to turn on, and where.
  if (state !== "ok" || pic.state === "gone") {
    const why = state === "username" ? "username" : "hidden";
    return (
      <Sheet labelledBy={`${uid}-title`} describedBy={`${uid}-lead`} onClose={onClose}>
        <div data-flaunt-sheet={why}>
          {head(why === "username" ? C.usernameTitle : C.hiddenTitle)}
          <p id={`${uid}-lead`} className="mt-2 text-[15px] leading-snug text-primary-700">
            {why === "username" ? C.username : pic.state === "gone" ? C.gone : C.hidden}
          </p>
          <Link href={FLAUNT_LINKS[why]} onClick={onClose} className={`${PRIMARY} mt-5`}>
            {why === "username" ? C.usernameLink : C.hiddenLink}
          </Link>
        </div>
      </Sheet>
    );
  }

  const ready = pic.state === "ready";
  const leadShare = ready && pic.share;
  const save = (cls: string) =>
    ready && (
      <a href={pic.url} download={pic.file.name} onClick={() => ga("medal_story_save")} data-flaunt-save="" className={cls}>
        <Download className="h-4 w-4" aria-hidden />
        {C.save}
      </a>
    );

  return (
    <Sheet labelledBy={`${uid}-title`} describedBy={`${uid}-lead`} onClose={onClose}>
      <div data-flaunt-sheet={pic.state}>
        {head(C.title)}
        <p id={`${uid}-lead`} className="mt-1 pr-10 text-[14px] leading-snug text-primary-600">
          {C.lead}
        </p>

        {/* The picture's own shape (9:16) is held while it is made, so nothing jumps when it arrives. */}
        <div className="mx-auto mt-4 aspect-[9/16] h-[min(46vh,400px)] overflow-hidden rounded-2xl bg-[#04261A] shadow-elevated ring-1 ring-primary-900/10">
          {ready ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pic.url} alt={C.alt} width={1080} height={1920} className="h-full w-full object-cover" data-flaunt-preview="" />
          ) : pic.state === "failed" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center" role="alert">
              <p className="text-[13px] leading-snug text-white/90">{C.failed}</p>
              <button
                type="button"
                onClick={() => {
                  setPic({ state: "loading" });
                  setAttempt((n) => n + 1);
                }}
                className="inline-flex items-center gap-2 min-h-[44px] rounded-full bg-white px-4 text-[14px] font-semibold text-primary-900 cursor-pointer focus-neon"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                {C.retry}
              </button>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3" role="status">
              <Loader2 className="h-6 w-6 animate-spin text-[#B8F23E]" aria-hidden />
              <p className="text-[13px] text-white/80">{C.making}</p>
            </div>
          )}
        </div>

        {ready && (
          <>
            {leadShare ? (
              <>
                <button type="button" onClick={share} data-flaunt-share="" className={`${PRIMARY} mt-4`}>
                  <Share2 className="h-4 w-4" aria-hidden />
                  {C.share}
                </button>
                <p className="mt-2 text-center text-[13px] leading-snug text-primary-600">{C.shareHint}</p>
              </>
            ) : (
              <>
                <div className="mt-4">{save(PRIMARY)}</div>
                <p className="mt-2 text-center text-[13px] leading-snug text-primary-600">{C.saveHint}</p>
              </>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {leadShare && save(SECOND)}
              <button type="button" onClick={() => void copy()} data-flaunt-copy="" className={SECOND}>
                {note === "copied" ? <Check className="h-4 w-4 text-accent-600" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
                {note === "copied" ? C.copied : C.copy}
              </button>
            </div>

            <p className="mt-2 min-h-[1px] text-center text-[13px] leading-snug text-primary-700" aria-live="polite">
              {note === "share_failed" && C.shareFailed}
              {note === "copy_failed" && (
                <>
                  {C.copyFailed} <span className="select-all break-all font-semibold">{link}</span>
                </>
              )}
            </p>
            <p className="mt-1 text-[12px] leading-snug text-primary-500">
              {C.copyHint}
              {leadShare && ` ${C.hold}`}
            </p>
          </>
        )}
      </div>
    </Sheet>
  );
}
