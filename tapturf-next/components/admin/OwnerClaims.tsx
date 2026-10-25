"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { keyLabel, toClaims, typedNameDiffers, type AdminClaim, type ClaimStatus } from "@/lib/admin/claims";
import { METHOD_NAMES, ago, istDateTime, whatsappLink } from "@/lib/admin/people";

const spaced = (p10: string) => p10.replace(/^(\d{5})(\d{5})$/, "$1 $2");

/** myTapturf claims: pending ones to approve or reject, then everyone with access. Each shows the account it came from. */
export function OwnerClaims() {
  const [claims, setClaims] = useState<AdminClaim[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/owner-claims", { cache: "no-store" });
    const j = (await r.json().catch(() => ({}))) as { claims?: unknown; error?: string };
    if (!r.ok) setError(j.error ?? "Couldn't load claims");
    else {
      setClaims(toClaims(j.claims));
      setNow(Date.now());
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const decide = async (c: AdminClaim, status: ClaimStatus) => {
    const key = c.turfId + c.userKey;
    setBusy(key);
    setFailed(null);
    let ok = false;
    try {
      const r = await fetch("/api/admin/owner-claims", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ turfId: c.turfId, userKey: c.userKey, status }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean };
      ok = r.ok && j.ok === true;
    } catch {
      /* shown below */
    }
    setBusy(null);
    if (!ok) setFailed(key);
    void load();
  };

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!claims) return <p className="text-sm text-primary-500">Loading claims…</p>;
  if (claims.length === 0) return <p className="text-sm text-primary-500">No claims yet. Owners claim their turf at /my.</p>;

  return (
    <ul className="space-y-2">
      {claims.map((c) => {
        const key = c.turfId + c.userKey;
        const a = c.account;
        const wa = a?.phone ? whatsappLink(a.phone) : null;
        return (
          <li key={key} className={`rounded-2xl border p-3 ${c.status === "pending" ? "border-amber-300 bg-amber-50" : "border-primary-200 bg-white"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <Link href={`/turf/${c.slug ?? c.turfId}`} target="_blank" className="font-semibold text-primary-900 hover:underline">
                  {c.turfName}
                </Link>
                <p className="text-[13px] text-primary-500">
                  {[c.area, c.city].filter(Boolean).join(", ")} · listed: {c.listedPhones.length ? c.listedPhones.map(spaced).join(", ") : "no mobile listed"}
                </p>

                {a ? (
                  <p className="text-[13px] text-primary-800">
                    <span className="font-semibold">{a.name ?? "No name"}</span>
                    {a.username && <span className="text-primary-500"> @{a.username}</span>}
                    <span className="ml-1.5 inline-block rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-semibold text-primary-700">{METHOD_NAMES[a.method]}</span>
                    {c.siteOwner && <span className="ml-1.5 inline-block rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-700">TapTurf (you)</span>}
                    {a.signedUpAt !== null && <span className="text-primary-500"> · joined {istDateTime(a.signedUpAt)}</span>}
                    {a.lastSeen !== null && now > 0 && <span className="text-primary-500"> · last sign-in {ago(a.lastSeen, now)}</span>}
                    {" · "}
                    <a href={`/admin?person=${a.id}#people`} className="font-semibold text-accent-700 hover:underline">
                      Open in people list
                    </a>
                  </p>
                ) : (
                  <p className="text-[13px] text-amber-800">
                    No TapTurf account for this sign-in ({keyLabel(c.userKey)}). Ask them to sign out and sign in again at tapturf.in/my.
                  </p>
                )}

                {a && (a.email || a.phone) && (
                  <p className="text-[13px] text-primary-700">
                    {a.email && (
                      <a href={`mailto:${a.email}?subject=${encodeURIComponent(`Your TapTurf claim for ${c.turfName}`)}`} className="underline underline-offset-2">
                        {a.email}
                      </a>
                    )}
                    {a.email && a.phone && " · "}
                    {a.phone && <span>{a.phone}</span>}
                    {wa && (
                      <>
                        {" "}
                        <a href={wa} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent-700 hover:underline">
                          WhatsApp
                        </a>
                      </>
                    )}
                  </p>
                )}

                <p className="text-[13px] text-primary-600">
                  {c.role ?? "role not given"} ·{" "}
                  {c.verifiedPhone ? `verified by a code to ${spaced(c.verifiedPhone)}` : c.via === "phone_match" ? "number matched" : "needs approval"} ·{" "}
                  <span className="font-semibold">{c.status}</span>
                  {c.createdAt !== null && ` · claimed ${istDateTime(c.createdAt)}`}
                  {a && a.otherClaims > 0 && ` · also claims ${a.otherClaims} other ${a.otherClaims === 1 ? "turf" : "turfs"}`}
                </p>
                {c.phoneGiven && !c.verifiedPhone && (
                  <p className="text-[13px] text-primary-700">
                    Number they gave: <span className="font-semibold">+91 {spaced(c.phoneGiven)}</span> (not on the listing)
                  </p>
                )}
                {c.note && <p className="text-[13px] text-primary-600">&ldquo;{c.note}&rdquo;</p>}
                {typedNameDiffers(c) && <p className="text-[12px] text-primary-500">Name typed on the claim: {c.storedName}</p>}
                {failed === key && <p className="text-[13px] text-red-700">Couldn&rsquo;t save that. Reload admin and try again.</p>}
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
