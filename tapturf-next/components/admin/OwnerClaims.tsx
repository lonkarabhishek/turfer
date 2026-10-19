"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Claim = {
  turf_id: string;
  user_key: string;
  status: "active" | "pending" | "rejected" | "revoked";
  via: "phone_match" | "admin";
  name: string | null;
  note: string | null;
  role: "owner" | "manager" | "staff" | null;
  created_at: string;
  turf_name: string;
  city: string | null;
  area: string | null;
  listed_phones: string[] | null;
};

const who = (k: string) => (k.startsWith("p:") ? `+91 ${k.slice(2)}` : k.slice(2));

/** myTapturf claims: pending ones to approve or reject, then everyone with access. */
export function OwnerClaims() {
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/owner-claims", { cache: "no-store" });
    const j = (await r.json().catch(() => ({}))) as { claims?: Claim[]; error?: string };
    if (!r.ok) setError(j.error ?? "Couldn't load claims");
    else setClaims(j.claims ?? []);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const decide = async (c: Claim, status: Claim["status"]) => {
    setBusy(c.turf_id + c.user_key);
    await fetch("/api/admin/owner-claims", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ turfId: c.turf_id, userKey: c.user_key, status }),
    }).catch(() => {});
    setBusy(null);
    void load();
  };

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!claims) return <p className="text-sm text-primary-500">Loading claims…</p>;
  if (claims.length === 0) return <p className="text-sm text-primary-500">No claims yet. Owners claim their turf at /my.</p>;

  return (
    <ul className="space-y-2">
      {claims.map((c) => {
        const key = c.turf_id + c.user_key;
        return (
          <li key={key} className={`rounded-2xl border p-3 ${c.status === "pending" ? "border-amber-300 bg-amber-50" : "border-primary-200 bg-white"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/turf/${c.turf_id}`} target="_blank" className="font-semibold text-primary-900 hover:underline">
                  {c.turf_name}
                </Link>
                <p className="text-[13px] text-primary-500">{[c.area, c.city].filter(Boolean).join(", ")} · listed: {c.listed_phones?.join(", ") || "no mobile listed"}</p>
                <p className="mt-1 text-[13px] text-primary-800">
                  {c.name ?? "No name"}{c.role ? ` (${c.role})` : ""} · {who(c.user_key)} · {c.via === "phone_match" ? "number matched" : "needs approval"} · <span className="font-semibold">{c.status}</span>
                </p>
                {c.note && <p className="mt-1 text-[13px] text-primary-600">&ldquo;{c.note}&rdquo;</p>}
              </div>
              <div className="flex gap-2">
                {c.status === "pending" && (
                  <>
                    <button type="button" disabled={busy === key} onClick={() => void decide(c, "active")} className="h-9 px-3 rounded-full bg-primary-900 text-white text-[13px] font-semibold cursor-pointer disabled:opacity-50">Approve</button>
                    <button type="button" disabled={busy === key} onClick={() => void decide(c, "rejected")} className="h-9 px-3 rounded-full bg-primary-100 text-primary-900 text-[13px] font-semibold cursor-pointer disabled:opacity-50">Reject</button>
                  </>
                )}
                {c.status === "active" && (
                  <button type="button" disabled={busy === key} onClick={() => void decide(c, "revoked")} className="h-9 px-3 rounded-full bg-primary-100 text-red-700 text-[13px] font-semibold cursor-pointer disabled:opacity-50">Revoke</button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
