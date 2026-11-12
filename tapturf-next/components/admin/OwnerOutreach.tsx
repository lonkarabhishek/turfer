"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, MessageCircle, Phone } from "lucide-react";
import { adminFetch } from "@/lib/admin/adminFetch";
import { istDateTime } from "@/lib/admin/people";
import {
  BY_MAX,
  DEFAULT_CITY,
  NOTE_MAX,
  OUTREACH_DAYS,
  OUTREACH_STATUSES,
  PAGE_SIZE,
  STATUS_LABEL,
  claimLabel,
  outreachFoldLine,
  type OutreachAnswer,
  type OutreachDays,
  type OutreachList,
  type OutreachRow,
  type OutreachSetAnswer,
  type OutreachStatus,
} from "@/lib/admin/outreach";
import { cityInfo } from "@/lib/city";
import { buildWhatsAppLink } from "@/lib/utils/whatsapp";
import { useFoldReport } from "./Fold";

/**
 * Owner outreach (20261113_owner_outreach.sql; lib/admin/outreach.ts has
 * the words and the API): one city's turfs, most Call and WhatsApp taps
 * first, for the team to phone or WhatsApp each owner with the turf's free
 * report (/report/<token>) and note who was contacted, so nobody is called
 * twice. The numbers are the turf's own listed ones, the ones its page's
 * buttons use; they are read only once this section is opened, and shown
 * only here.
 */

/** The team member's name, kept on this device so each note says who set it. */
const BY_KEY = "tapturf_admin_outreach_by";

const STATUS_TONE: Record<OutreachStatus, string> = {
  not_contacted: "border-primary-200 bg-white text-primary-900",
  contacted: "border-amber-300 bg-amber-50 text-amber-900",
  interested: "border-accent-600 bg-accent-50 text-accent-700",
  not_interested: "border-primary-300 bg-primary-100 text-primary-700",
  wrong_number: "border-red-200 bg-red-50 text-red-700",
};

const errorText = (e: string) =>
  e === "not_set_up"
    ? "Owner outreach isn't set up in the database yet (20261113_owner_outreach.sql)."
    : e === "forbidden"
      ? "Only the site owner can see this."
      : "Couldn't load the turfs.";

export function OwnerOutreach() {
  const [city, setCity] = useState(DEFAULT_CITY);
  const [days, setDays] = useState<OutreachDays>(30);
  const [list, setList] = useState<OutreachList | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [by, setBy] = useState("");
  // Read only once the fold around it is open: the list holds every turf's number.
  const [opened, setOpened] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const report = useFoldReport();

  useEffect(() => {
    const fold = root.current?.closest("details");
    const t = setTimeout(() => {
      try {
        setBy(window.localStorage.getItem(BY_KEY) ?? "");
      } catch {
        // No storage: the name is asked again next time.
      }
      if (!fold || fold.open) setOpened(true);
    }, 0);
    const onToggle = () => {
      if (fold?.open) setOpened(true);
    };
    fold?.addEventListener("toggle", onToggle);
    return () => {
      clearTimeout(t);
      fold?.removeEventListener("toggle", onToggle);
    };
  }, []);

  const load = useCallback(async (c: string, d: OutreachDays) => {
    setLoading(true);
    try {
      const r = await adminFetch(`/api/admin/outreach?city=${encodeURIComponent(c)}&days=${d}`, { cache: "no-store" });
      const j = (await r.json().catch(() => ({ ok: false, error: "unavailable" }))) as OutreachAnswer;
      if (j.ok) {
        setList(j.list);
        setShown(PAGE_SIZE);
        setError("");
      } else setError(errorText(j.error));
    } catch {
      setError("Couldn't load the turfs. Check your connection.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!opened) return;
    const t = setTimeout(() => void load(city, days), 0);
    return () => clearTimeout(t);
  }, [opened, city, days, load]);

  useEffect(() => {
    if (list) report?.({ line: outreachFoldLine(list) });
  }, [list, report]);

  const saveBy = (v: string) => {
    setBy(v);
    try {
      window.localStorage.setItem(BY_KEY, v.trim());
    } catch {
      // No storage: it stays for this visit.
    }
  };

  const patch = (id: string, p: Partial<OutreachRow>) => setList((l) => (l ? { ...l, turfs: l.turfs.map((t) => (t.id === id ? { ...t, ...p } : t)) } : l));

  const cities = list?.cities.length ? list.cities : [{ id: city, label: cityInfo(city).label, n: 0 }];
  const rows = list && list.city === city ? list.turfs : null;

  return (
    <div ref={root} className="space-y-4" data-owner-outreach>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-0 flex-1 basis-40">
          <span className="block text-[12px] font-semibold text-primary-600">City</span>
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-primary-200 bg-white px-3 text-[15px] text-primary-900"
          >
            {!cities.some((c) => c.id === city) && <option value={city}>{cityInfo(city).label}</option>}
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
                {c.n ? ` (${c.n})` : ""}
              </option>
            ))}
          </select>
        </label>
        <div role="group" aria-label="Days counted" className="flex h-11 rounded-full border border-primary-200 bg-white p-1">
          {OUTREACH_DAYS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={days === d}
              onClick={() => setDays(d)}
              className={`h-full rounded-full px-3.5 text-[13px] font-semibold ${days === d ? "bg-primary-900 text-white" : "text-primary-700 hover:bg-primary-50"}`}
            >
              {d} days
            </button>
          ))}
        </div>
        <label className="block min-w-0 flex-1 basis-40">
          <span className="block text-[12px] font-semibold text-primary-600">Your name, for the notes</span>
          <input
            value={by}
            onChange={(e) => saveBy(e.target.value)}
            maxLength={BY_MAX}
            placeholder="e.g. Asha"
            autoComplete="off"
            className="mt-1 h-11 w-full rounded-xl border border-primary-200 bg-white px-3 text-[15px] text-primary-900 placeholder:text-primary-400"
          />
        </label>
      </div>

      {error && (
        <p className="text-sm text-red-600">
          {error}{" "}
          <button type="button" onClick={() => void load(city, days)} className="ml-1 inline-flex min-h-11 items-center font-semibold text-accent-700 hover:underline">
            Retry
          </button>
        </p>
      )}
      {!rows && !error && <p className="text-sm text-primary-500">{opened ? "Loading turfs…" : "Open to load the turfs."}</p>}

      {rows && (
        <>
          <p className="text-[12px] leading-snug text-primary-500">
            {rows.length.toLocaleString("en-IN")} active {rows.length === 1 ? "turf" : "turfs"} in {cityInfo(city).label}, most Call and WhatsApp taps in the last {list!.days} days first.
            The numbers are the ones each turf&rsquo;s page shows. The WhatsApp message and the report always say the last 30 days.
            {loading ? " Refreshing…" : ""}
          </p>
          {rows.length === 0 && <p className="text-sm text-primary-500">No active turfs here.</p>}
          <ul className="space-y-3">
            {rows.slice(0, shown).map((t) => (
              <Row key={t.id} t={t} by={by} onSaved={(p) => patch(t.id, p)} />
            ))}
          </ul>
          {rows.length > shown && (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE_SIZE)}
              className="inline-flex h-11 items-center rounded-full border border-primary-200 px-5 text-[14px] font-bold text-primary-800 hover:bg-primary-50"
            >
              Show more ({(rows.length - shown).toLocaleString("en-IN")} left)
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Row({ t, by, onSaved }: { t: OutreachRow; by: string; onSaved: (p: Partial<OutreachRow>) => void }) {
  const [note, setNote] = useState(t.note ?? "");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  const [copied, setCopied] = useState(false);
  const dirty = note.trim() !== (t.note ?? "");

  const save = async (status: OutreachStatus) => {
    setSaving(true);
    setProblem("");
    try {
      const r = await fetch("/api/admin/outreach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ turf: t.id, status, note: note.trim() || null, by: by.trim() || null }),
      });
      const j = (await r.json().catch(() => ({ ok: false, error: "unavailable" }))) as OutreachSetAnswer;
      if (j.ok) {
        onSaved(j.saved);
        setNote(j.saved.note ?? "");
      } else setProblem(j.error === "bad" ? "Not saved: the note is too long." : "Not saved. Reload admin and try again.");
    } catch {
      setProblem("Not saved. Check your connection.");
    }
    setSaving(false);
  };

  const copy = async () => {
    if (!t.report) return;
    try {
      await navigator.clipboard.writeText(t.report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy the report link", t.report);
    }
  };

  const waHref = t.wa && t.message ? buildWhatsAppLink({ phone: t.wa.digits, text: t.message }) : null;
  const claimTone = t.claim === "active" ? "bg-accent-50 text-accent-700" : t.claim === "pending" ? "bg-amber-100 text-amber-900" : "bg-primary-100 text-primary-700";
  const number = t.call ?? t.wa;
  const pill = "inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-4 text-[13px] font-semibold";

  return (
    <li className="rounded-2xl border border-primary-200 bg-white p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={t.path} target="_blank" className="block text-[15px] font-semibold leading-snug text-primary-900 hover:underline [overflow-wrap:anywhere]">
            {t.name}
          </Link>
          <p className="mt-0.5 text-[13px] leading-snug text-primary-500">
            {[t.area, number ? `+91 ${number.local}${t.call?.landline ? " (landline)" : ""}` : "No number on its page"].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${claimTone}`}>{claimLabel(t.claim)}</span>
      </div>

      <dl className="mt-2.5 grid grid-cols-3 gap-2 text-center tabular-nums">
        {(
          [
            ["Page views", t.views],
            ["Call taps", t.calls],
            ["WhatsApp taps", t.whatsapp],
          ] as const
        ).map(([label, n]) => (
          <div key={label} className="rounded-xl bg-primary-50 px-1 py-1.5">
            <dd className="text-[17px] font-bold leading-tight text-primary-900">{n.toLocaleString("en-IN")}</dd>
            <dt className="text-[11px] leading-tight text-primary-500">{label}</dt>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        {t.call && (
          <a href={`tel:${t.call.e164}`} className={`${pill} bg-primary-100 text-primary-900 hover:bg-primary-200`}>
            <Phone className="h-4 w-4" aria-hidden />
            Call
          </a>
        )}
        {waHref && (
          <a href={waHref} target="_blank" rel="noopener noreferrer" className={`${pill} bg-accent-500 text-white hover:bg-accent-600`}>
            <MessageCircle className="h-4 w-4" aria-hidden />
            WhatsApp
          </a>
        )}
        <button type="button" onClick={() => void copy()} disabled={!t.report} className={`${pill} border border-primary-200 text-primary-800 hover:bg-primary-50 disabled:opacity-50`}>
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? "Copied" : "Copy report link"}
        </button>
      </div>
      {!t.report && <p className="mt-1.5 text-[12px] text-amber-800">No report link: ACCOUNT_KEY isn&rsquo;t set on this deployment.</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-primary-100 pt-3">
        <label className="sr-only" htmlFor={`outreach-status-${t.id}`}>
          Outreach status of {t.name}
        </label>
        <select
          id={`outreach-status-${t.id}`}
          value={t.status}
          disabled={saving}
          onChange={(e) => void save(e.target.value as OutreachStatus)}
          className={`h-11 rounded-full border px-3 text-[13px] font-semibold disabled:cursor-wait ${STATUS_TONE[t.status]}`}
        >
          {OUTREACH_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor={`outreach-note-${t.id}`}>
          Note about {t.name}
        </label>
        <input
          id={`outreach-note-${t.id}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={NOTE_MAX}
          placeholder="Note (optional)"
          autoComplete="off"
          className="h-11 min-w-0 flex-1 basis-40 rounded-xl border border-primary-200 bg-white px-3 text-[14px] text-primary-900 placeholder:text-primary-400"
        />
        {dirty && (
          <button type="button" disabled={saving} onClick={() => void save(t.status)} className={`${pill} bg-primary-900 text-white disabled:cursor-wait disabled:opacity-60`}>
            {saving ? "Saving…" : "Save note"}
          </button>
        )}
      </div>
      <p className="mt-1.5 text-[12px] text-primary-500" aria-live="polite">
        {problem ? <span className="text-red-700">{problem}</span> : t.at ? `${t.by ?? "Site owner"}, ${istDateTime(Date.parse(t.at))}` : "Nobody has noted this turf yet."}
      </p>
    </li>
  );
}
