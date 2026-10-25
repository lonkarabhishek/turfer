"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Camera } from "lucide-react";
import { keyLabel } from "@/lib/admin/claims";
import { istDateTime } from "@/lib/admin/people";
import { toAdminPhotos, type AdminOwnerPhoto } from "@/lib/my/photoTypes";
import { imageUrlForCard } from "@/lib/utils/images";

type Action = "restore" | "remove" | "check";

function statusOf(p: AdminOwnerPhoto): { label: string; tone: string } {
  if (p.status === "removed") return { label: "Removed", tone: "bg-primary-100 text-primary-600" };
  if (p.status === "checking") return { label: p.checkTries > 0 ? `Being checked (try ${p.checkTries + 1} of 3)` : "Being checked", tone: "bg-primary-100 text-primary-700" };
  if (p.status === "held") return { label: p.unclaimed ? "Kept off: claim taken away" : "Kept off by check", tone: "bg-amber-100 text-amber-900" };
  if (p.override) return { label: "Live (you put it back)", tone: "bg-accent-50 text-accent-700" };
  if (p.checkedAt === null) return { label: "Went up unchecked", tone: "bg-amber-50 text-amber-800" };
  return { label: "Live", tone: "bg-accent-50 text-accent-700" };
}

/** Waiting for the check, or up without one (the check was down): Check now. */
const checkable = (p: AdminOwnerPhoto) => (p.status === "checking" || p.status === "live") && p.checkedAt === null && !p.override;

/** Photos owners added on myTapturf, newest first: what the check said, and restore, remove or check now. */
export function OwnerPhotos() {
  const [rows, setRows] = useState<AdminOwnerPhoto[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ id: string; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/owner-photos", { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as { photos?: unknown; error?: string };
      if (!r.ok) return setError(j.error === "not_set_up" ? "Owner photos aren't set up in the database yet (20261025_owner_photos.sql)." : (j.error ?? "Couldn't load owner photos"));
      setRows(toAdminPhotos(j.photos));
      setError("");
    } catch {
      setError("Couldn't load owner photos. Check your connection.");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const act = async (p: AdminOwnerPhoto, action: Action) => {
    if (action === "remove" && !window.confirm(`Remove this photo from ${p.turfName}?`)) return;
    setBusy(p.id);
    setFailed(null);
    let text: string | null = "Couldn't do that. Reload admin and try again.";
    try {
      const r = await fetch("/api/admin/owner-photos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, id: p.id, turfId: p.turfId }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; skipped?: string };
      if (r.ok && j.ok === true) text = j.skipped ? "The check isn't available right now (the AI judge is down or not set up). Try again later." : null;
    } catch {
      /* shown below */
    }
    setBusy(null);
    if (text) setFailed({ id: p.id, text });
    void load();
  };

  if (!rows) return error ? <p className="text-sm text-red-600">{error}</p> : <p className="text-sm text-primary-500">Loading owner photos…</p>;
  if (rows.length === 0) return <p className="text-sm text-primary-500">No owner photos yet. Owners add them on their turf page in myTapturf.</p>;

  return (
    <>
    {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
    <ul className="space-y-2">
      {rows.map((p) => {
        const s = statusOf(p);
        return (
          <li key={p.id} className={`rounded-2xl border p-3 ${p.status === "held" ? "border-amber-300 bg-amber-50" : "border-primary-200 bg-white"}`}>
            <div className="flex flex-wrap items-start gap-3">
              <Thumb url={p.url} dim={p.status !== "live"} />
              <div className="min-w-0 flex-1 space-y-1">
                <Link href={`/turf/${p.slug ?? p.turfId}`} target="_blank" className="font-semibold text-primary-900 hover:underline">
                  {p.turfName}
                </Link>
                <p className="text-[13px] text-primary-500">
                  {[p.area, p.city].filter(Boolean).join(", ") || "No city"} · by {keyLabel(p.userKey)}
                  {p.createdAt !== null && ` · ${istDateTime(p.createdAt)}`}
                  {p.bytes !== null && ` · ${Math.round(p.bytes / 1024)} KB`}
                </p>
                <p className="text-[13px] text-primary-700">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.tone}`}>{s.label}</span>
                  {p.note && <span className="ml-1.5">&ldquo;{p.note}&rdquo;</span>}
                  {p.status === "removed" && p.removedBy && <span className="text-primary-500"> · by {p.removedBy === p.userKey ? "the owner" : keyLabel(p.removedBy)}</span>}
                </p>
                {failed?.id === p.id && <p className="text-[13px] text-red-700">{failed.text}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {checkable(p) && (
                  <button type="button" disabled={busy === p.id} onClick={() => void act(p, "check")} className="h-9 px-3 rounded-full bg-primary-900 text-white text-[13px] font-semibold cursor-pointer disabled:opacity-50">
                    {busy === p.id ? "Checking…" : "Check now"}
                  </button>
                )}
                {p.status === "held" && (
                  <button type="button" disabled={busy === p.id} onClick={() => void act(p, "restore")} className="h-9 px-3 rounded-full bg-primary-900 text-white text-[13px] font-semibold cursor-pointer disabled:opacity-50">
                    Put it back
                  </button>
                )}
                {p.status !== "removed" && (
                  <button type="button" disabled={busy === p.id} onClick={() => void act(p, "remove")} className="h-9 px-3 rounded-full bg-primary-100 text-red-700 text-[13px] font-semibold cursor-pointer disabled:opacity-50">
                    Remove
                  </button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
    </>
  );
}

function Thumb({ url, dim }: { url: string | null; dim: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <a href={url ?? undefined} target="_blank" rel="noopener noreferrer" className="relative block w-24 h-[72px] shrink-0 rounded-xl overflow-hidden bg-primary-100">
      {!url || broken ? (
        <span className="absolute inset-0 flex items-center justify-center text-primary-400"><Camera className="w-5 h-5" /></span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrlForCard(url)} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)} className={`w-full h-full object-cover ${dim ? "opacity-60" : ""}`} />
      )}
    </a>
  );
}
