"use client";

import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { adminFetch } from "@/lib/admin/adminFetch";
import { istDateTime } from "@/lib/admin/people";
import {
  EMAIL_MODES,
  MODE_DETAIL,
  MODE_LABEL,
  emailFoldLine,
  sendingNote,
  skipLabel,
  testLineText,
  testProblemText,
  type EmailAdminAnswer,
  type EmailAdminStatus,
  type EmailCounts,
  type EmailMode,
  type EmailTestAnswer,
} from "@/lib/email/mode";
import { useFoldReport } from "./Fold";

/**
 * The Emails card (20261110_email.sql; lib/email/mode.ts has the words and
 * the API): who gets TapTurf's emails (Off, Test: only me, On for
 * everyone; it changes at once, no deploy), how many in the last 24 hours
 * and 7 days were sent, skipped (and why), failed or queued, as counts
 * only, never an address or a name, and "Send me one of each", the ten
 * emails to the site owner's own address, with each one's result.
 */
export function EmailsCard() {
  const [status, setStatus] = useState<EmailAdminStatus | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<EmailMode | null>(null);
  const [saveError, setSaveError] = useState("");
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<EmailTestAnswer | null>(null);
  const report = useFoldReport();

  const take = useCallback((j: EmailAdminAnswer) => {
    if (j.ok) {
      setStatus(j.status);
      setError("");
      return true;
    }
    setError(j.error === "not_set_up" ? "Emails aren't set up in the database yet (20261110_email.sql)." : j.error === "forbidden" ? "Only the site owner can see this." : "Couldn't load the emails.");
    return false;
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await adminFetch("/api/admin/emails", { cache: "no-store" });
      take((await r.json().catch(() => ({ ok: false, error: "unavailable" }))) as EmailAdminAnswer);
    } catch {
      setError("Couldn't load the emails. Check your connection.");
    }
  }, [take]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (status) report?.({ line: emailFoldLine(status) });
  }, [status, report]);

  const choose = async (mode: EmailMode) => {
    if (!status || saving || mode === status.mode) return;
    if (mode === "on" && !window.confirm("Turn emails on for everyone? Everyone with a Google-confirmed email gets the emails they have on, from the next one due.")) return;
    setSaving(mode);
    setSaveError("");
    try {
      const r = await fetch("/api/admin/emails", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode }) });
      const j = (await r.json().catch(() => ({ ok: false, error: "unavailable" }))) as EmailAdminAnswer;
      if (!j.ok) setSaveError("Not changed. Reload admin and try again.");
      else take(j);
    } catch {
      setSaveError("Not changed. Check your connection.");
    }
    setSaving(null);
  };

  const sendTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      const r = await fetch("/api/admin/emails/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ send: true }) });
      setTest((await r.json().catch(() => ({ ok: false, reason: "unavailable" }))) as EmailTestAnswer);
    } catch {
      setTest({ ok: false, reason: "unavailable" });
    }
    setTesting(false);
    void load();
  };

  if (!status)
    return error ? (
      <p className="text-sm text-red-600">
        {error}{" "}
        <button type="button" onClick={() => void load()} className="ml-1 inline-flex min-h-11 items-center font-semibold text-accent-700 hover:underline">
          Retry
        </button>
      </p>
    ) : (
      <p className="text-sm text-primary-500">Loading emails…</p>
    );

  const note = sendingNote(status.sending);
  const sent = test?.ok ? test.results.filter((l) => l.result === "sent").length : 0;

  return (
    <div className="space-y-5 rounded-2xl border border-primary-200 bg-white p-4" data-emails-card>
      {note && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] leading-snug text-amber-900">{note}</p>}

      <section aria-labelledby="emails-who-h">
        <h3 id="emails-who-h" className="text-[14px] font-semibold text-primary-900">
          Who gets emails
        </h3>
        <div role="group" aria-labelledby="emails-who-h" className="mt-2 space-y-2">
          {EMAIL_MODES.map((m) => {
            const on = status.mode === m;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={on}
                disabled={saving !== null}
                onClick={() => void choose(m)}
                className={`flex w-full min-h-14 items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-wait ${
                  on ? "border-accent-600 bg-accent-50" : "border-primary-200 bg-white hover:bg-primary-50"
                }`}
              >
                <span aria-hidden className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-accent-600 bg-accent-600 text-white" : "border-primary-300"}`}>
                  {on && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-snug text-primary-900">
                    {MODE_LABEL[m]}
                    {saving === m && <span className="ml-2 text-[12px] font-normal text-primary-500">Saving…</span>}
                  </span>
                  <span className="block text-[13px] leading-snug text-primary-600">{MODE_DETAIL[m]}</span>
                </span>
              </button>
            );
          })}
        </div>
        {saveError && <p className="mt-2 text-[13px] text-red-700">{saveError}</p>}
        <p className="mt-2 text-[12px] text-primary-500">
          {status.modeSince ? `Since ${istDateTime(Date.parse(status.modeSince))}. ` : ""}A change works at once, with no deploy. The in-app alerts and phone notifications are the same in every mode.
        </p>
      </section>

      <section aria-labelledby="emails-counts-h">
        <h3 id="emails-counts-h" className="text-[14px] font-semibold text-primary-900">
          How many emails
        </h3>
        <Counts day={status.day} week={status.week} />
      </section>

      <section aria-labelledby="emails-test-h">
        <h3 id="emails-test-h" className="text-[14px] font-semibold text-primary-900">
          Send me one of each
        </h3>
        <p className="mt-1 text-[13px] leading-snug text-primary-600">
          The ten emails with sample games and players, to your own Google address, with [Test] before each subject, whatever the mode. Once every 10 minutes. Their buttons open the games list.
        </p>
        <button
          type="button"
          onClick={() => void sendTest()}
          disabled={testing}
          className="mt-3 inline-flex h-11 items-center rounded-full bg-primary-900 px-5 text-[14px] font-bold text-white hover:bg-primary-800 disabled:cursor-wait disabled:opacity-60"
        >
          {testing ? "Sending…" : "Send me one of each"}
        </button>
        {status.testAt && !test && <p className="mt-2 text-[12px] text-primary-500">Last test: {istDateTime(Date.parse(status.testAt))}</p>}
        <div aria-live="polite">
          {test && !test.ok && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] leading-snug text-amber-900">{testProblemText(test.reason, test.seconds)}</p>}
          {test?.ok && (
            <div className="mt-3">
              <p className="text-[13px] font-semibold text-primary-900">
                {sent === test.results.length ? `All ${sent} sent to your Google address.` : `${sent} of ${test.results.length} sent to your Google address.`}
              </p>
              <ul className="mt-2 divide-y divide-primary-100 rounded-xl border border-primary-200">
                {test.results.map((l) => (
                  <li key={l.key} className="flex items-start justify-between gap-3 px-3 py-2 text-[13px]">
                    <span className="min-w-0 text-primary-800">{l.label}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${l.result === "sent" ? "bg-accent-50 text-accent-700" : "bg-red-50 text-red-700"}`}>{testLineText(l)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Counts({ day, week }: { day: EmailCounts; week: EmailCounts }) {
  const whys = [...new Set([...week.skipped.map((s) => s.why), ...day.skipped.map((s) => s.why)])];
  const of = (c: EmailCounts, why: string) => c.skipped.find((s) => s.why === why)?.n ?? 0;
  const rows: { label: string; d: number; w: number; sub?: boolean; tone?: string }[] = [
    { label: "Sent", d: day.sent, w: week.sent },
    { label: "Queued", d: day.queued, w: week.queued },
    { label: "Failed", d: day.failed, w: week.failed, tone: day.failed || week.failed ? "text-red-700" : undefined },
    ...(day.expired || week.expired ? [{ label: "Expired, never sent late", d: day.expired, w: week.expired }] : []),
    { label: "Skipped", d: day.skippedTotal, w: week.skippedTotal },
    ...whys.map((why) => ({ label: skipLabel(why), d: of(day, why), w: of(week, why), sub: true })),
  ];
  return (
    <table className="mt-2 w-full text-[14px] tabular-nums">
      <thead>
        <tr className="text-[12px] text-primary-500">
          <th scope="col" className="py-1 text-left font-normal">
            <span className="sr-only">Emails</span>
          </th>
          <th scope="col" className="w-16 whitespace-nowrap py-1 pl-2 text-right font-normal">24 hours</th>
          <th scope="col" className="w-16 whitespace-nowrap py-1 pl-2 text-right font-normal">7 days</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-primary-100">
        {rows.map((r) => (
          <tr key={r.label} className={r.sub ? "text-[13px] text-primary-600" : `text-primary-900 ${r.tone ?? ""}`}>
            <th scope="row" className={`py-1.5 text-left ${r.sub ? "pl-3 font-normal" : "font-semibold"}`}>
              {r.label}
            </th>
            <td className="py-1.5 text-right">{r.d.toLocaleString("en-IN")}</td>
            <td className="py-1.5 text-right">{r.w.toLocaleString("en-IN")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
