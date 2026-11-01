"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Star } from "lucide-react";
import { istDateTime } from "@/lib/admin/people";
import { adminFetch } from "@/lib/admin/adminFetch";
import { flagReasonLabel, toAdminFlags, type AdminFlag } from "@/lib/reviews/flags";
import { reviewPhotoUrl } from "@/lib/reviews/photos";
import type { PlayedWhen } from "@/lib/reviews/catalog";
import { playedLine, ReportChips } from "@/components/turf/reviews/ui";
import { useFoldReport } from "./Fold";

const STATUS: Record<AdminFlag["status"], { label: string; tone: string }> = {
  open: { label: "Waiting for you", tone: "bg-amber-100 text-amber-900" },
  hidden: { label: "Hidden", tone: "bg-primary-100 text-primary-600" },
  kept: { label: "Kept up", tone: "bg-accent-50 text-accent-700" },
};
// Kept, or closed with nothing to hide: the review isn't up (its author took it down, or it's gone).
const CLOSED = { label: "Closed", tone: "bg-primary-100 text-primary-700" };

const when = (iso: string | null) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? istDateTime(t) : "";
};

/**
 * Players' reports of reviews ("Report this review",
 * 20261102_reviews_trust.sql), for the Reported reviews fold on /admin and
 * /admin/reviews: open ones first, oldest first, then the latest decided.
 * Hide takes the review off (as a removal request's Remove does), Keep
 * leaves it up; either closes every open report of it. One that isn't live
 * any more (its author took it down) can only be closed. Its author is
 * never told who reported it.
 */
export function ReviewFlags() {
  const [rows, setRows] = useState<AdminFlag[] | null>(null);
  const [open, setOpen] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ id: string; text: string } | null>(null);
  const report = useFoldReport();

  const load = useCallback(async () => {
    try {
      const r = await adminFetch("/api/admin/review-flags", { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      const shaped = r.ok ? toAdminFlags(j) : null;
      if (!shaped) {
        return setError(j.error === "not_set_up" ? "Reported reviews aren't set up in the database yet (20261102_reviews_trust.sql)." : (j.error ?? "Couldn't load reported reviews"));
      }
      setRows(shaped.flags);
      setOpen(shaped.open);
      setError("");
    } catch {
      setError("Couldn't load reported reviews. Check your connection.");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  // The fold around this list: how many wait.
  useEffect(() => {
    if (!rows) return;
    report?.({ line: open ? `${open} waiting · Hide takes a review off, Keep leaves it up` : "None waiting · players report reviews from the turf page", waiting: open });
  }, [rows, open, report]);

  const decide = async (x: AdminFlag, decision: "hide" | "keep") => {
    if (decision === "hide" && !window.confirm(`Hide this review on ${x.turf.name}? Its author sees it as hidden and is never told who reported it.`)) return;
    setBusy(x.id);
    setFailed(null);
    let text: string | null = "Couldn't do that. Reload admin and try again.";
    try {
      const r = await fetch("/api/admin/review-flags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: x.id, decision }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean };
      if (r.ok && j.ok === true) text = null;
    } catch {
      /* shown below */
    }
    setBusy(null);
    if (text) setFailed({ id: x.id, text });
    void load();
  };

  if (!rows)
    return error ? (
      <p className="text-sm text-red-600">
        {error}{" "}
        <button type="button" onClick={() => void load()} className="ml-1 font-semibold text-accent-700 hover:underline">
          Retry
        </button>
      </p>
    ) : (
      <p className="text-sm text-primary-400">Loading reported reviews…</p>
    );

  if (rows.length === 0) return <p className="text-sm text-primary-500">No reported reviews. Players can report one from the turf page.</p>;

  return (
    <ul className="space-y-3">
      {rows.map((x) => {
        const v = x.review;
        // Only a live review can be hidden; a report of one that isn't just closes.
        const live = v?.status === "live";
        const s = x.status === "kept" && !live ? CLOSED : STATUS[x.status];
        const played = v ? playedLine(v.sport, v.playedWhen as PlayedWhen | null) : "";
        return (
          <li key={x.id} className={`rounded-2xl border p-4 ${x.status === "open" ? "border-amber-200 bg-white" : "border-primary-100 bg-primary-50/50"}`}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
              {x.turf.slug ? (
                <Link href={`/turf/${x.turf.slug}`} className="font-semibold text-primary-900 hover:text-accent-600">
                  {x.turf.name}
                </Link>
              ) : (
                <span className="font-semibold text-primary-900">{x.turf.name}</span>
              )}
              {x.turf.city && <span className="text-primary-500 capitalize">· {x.turf.city}</span>}
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${s.tone}`}>{s.label}</span>
            </div>

            {v ? (
              <div className="mt-2 rounded-xl border border-primary-100 bg-white p-3">
                <p className="text-[13px] text-primary-500 flex flex-wrap items-center gap-x-1.5">
                  <span className="font-semibold text-primary-900">{v.author ?? "A player"}</span>
                  <span className="inline-flex items-center gap-0.5 text-primary-800">
                    {v.rating} <Star className="w-3.5 h-3.5 fill-current text-accent-500" aria-hidden />
                  </span>
                  {played && <span>· {played}</span>}
                  {v.createdAt && <span>· {when(v.createdAt)}</span>}
                  {v.playedHere && (
                    <span className="inline-flex items-center gap-0.5 font-semibold text-accent-700">
                      · <BadgeCheck className="w-3.5 h-3.5" aria-hidden /> Played here
                    </span>
                  )}
                  {v.status !== "live" && <span className="font-semibold text-primary-700">· now {v.status}</span>}
                </p>
                <ReportChips aspects={v.aspects} sport={v.sport} turfSports={[]} />
                {v.comment && <p className="mt-1.5 text-[14px] text-primary-800 leading-snug whitespace-pre-line break-words">{v.comment}</p>}
                {v.photos.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    {v.photos.map((p) => (
                      <a key={p.id} href={reviewPhotoUrl(p.path)} target="_blank" rel="noopener noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={reviewPhotoUrl(p.thumb)} alt="A photo on this review" width={64} height={64} loading="lazy" className="w-16 h-16 rounded-lg object-cover bg-primary-100" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-2 text-[13px] text-primary-500">The review is no longer there.</p>
            )}

            <p className="mt-2 text-[14px] text-primary-900">
              <span className="font-semibold">{flagReasonLabel(x.reason)}</span>
              {x.detail && <span className="text-primary-700"> · “{x.detail}”</span>}
            </p>
            <p className="mt-0.5 text-[12px] text-primary-500">
              Reported by {x.by.name ?? "a player"}
              {x.by.manages && " (manages this turf)"} · {when(x.createdAt)}
              {x.others > 0 && ` · ${x.others} other player${x.others === 1 ? "" : "s"} reported it too`}
              {x.by.account && (
                <>
                  {" · "}
                  <a href={`/admin?person=${x.by.account}#people`} className="font-semibold text-accent-700 hover:underline whitespace-nowrap">
                    Open in people list
                  </a>
                </>
              )}
              {x.decidedAt && ` · decided ${when(x.decidedAt)}`}
            </p>

            {x.status === "open" && (
              <div className="mt-3 flex flex-wrap gap-2">
                {live && (
                  <button
                    type="button"
                    disabled={busy === x.id}
                    onClick={() => void decide(x, "hide")}
                    className="min-h-10 px-4 rounded-full bg-hot-500 text-white text-[13px] font-bold hover:bg-hot-600 disabled:opacity-50"
                  >
                    Hide review
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy === x.id}
                  onClick={() => void decide(x, "keep")}
                  className="min-h-10 px-4 rounded-full border border-primary-200 bg-white text-primary-900 text-[13px] font-bold hover:bg-primary-50 disabled:opacity-50"
                >
                  {live ? "Keep it up" : "Close report"}
                </button>
              </div>
            )}
            {failed?.id === x.id && <p className="mt-2 text-[13px] text-red-600">{failed.text}</p>}
          </li>
        );
      })}
    </ul>
  );
}
