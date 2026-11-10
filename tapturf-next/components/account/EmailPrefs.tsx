"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Mail } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getEmailPrefs, patchEmailPrefs, quietToken } from "@/lib/account/client";
import { EMAIL_GROUPS, GROUP_DETAIL, GROUP_LABEL, type EmailGroup, type EmailPrefsResponse } from "@/lib/email/types";
import type { AppUser } from "@/types/user";

/**
 * The Me tab's Emails block (Profile, #emails, where the link in every
 * email's page points): the address we email, only the account's own one
 * Google confirmed, and three switches that save as they are tapped (Join
 * requests and answers, Game changes, Reminders). An account with no such
 * address gets one line on how to add one. Hidden until the database has
 * emails (ready: false). /api/account/emails, lib/email/server.ts.
 */
export function EmailPrefs({ user }: { user: AppUser }) {
  const { getToken, signedInWith } = useAuth();
  const [prefs, setPrefs] = useState<EmailPrefsResponse | null>(null);
  const [busy, setBusy] = useState<EmailGroup | null>(null);
  const [error, setError] = useState("");
  const ref = useRef<HTMLElement>(null);
  const scrolled = useRef(false);
  // Read quietly (a failed read never signs anyone out); a change uses getToken.
  const readToken = quietToken(signedInWith);

  const load = useCallback(async () => {
    const tok = await readToken();
    if (!("token" in tok)) return;
    const a = await getEmailPrefs(tok.token);
    if (a.status === 200 && "ready" in a.body) setPrefs(a.body);
  }, [readToken]);

  // Again when the account's email changes (Google added or removed above).
  useEffect(() => {
    void load();
  }, [load, user.id, user.email, user.googleEmail]);

  // The email page's "Manage all your emails" link comes here (#emails): the block shows only once read, after the
  // browser looked for the anchor, so go to it then (once).
  const ready = !!prefs?.ready;
  useEffect(() => {
    if (!ready || scrolled.current || window.location.hash !== "#emails") return;
    scrolled.current = true;
    ref.current?.scrollIntoView({ block: "start" });
  }, [ready]);

  if (!prefs?.ready) return null;

  const flip = async (group: EmailGroup) => {
    if (busy) return;
    const next = !prefs[group];
    setError("");
    setBusy(group);
    setPrefs({ ...prefs, [group]: next });
    try {
      const tok = await getToken();
      const a = "token" in tok ? await patchEmailPrefs(tok.token, { [group]: next }) : null;
      if (a && a.status === 200 && "ready" in a.body) setPrefs(a.body);
      else {
        setPrefs((p) => (p ? { ...p, [group]: !next } : p));
        setError("Couldn't save that. Check your connection and try again.");
      }
    } finally {
      setBusy(null);
    }
  };

  const byPhone = signedInWith === "phone";

  return (
    <section ref={ref} id="emails" aria-labelledby="emails-h" className="scroll-mt-24 mt-8 pt-6 border-t border-primary-200">
      <h2 id="emails-h" className="flex items-center gap-2 text-[15px] font-semibold text-primary-900">
        <Mail className="w-4 h-4 text-accent-600" aria-hidden />
        Emails
      </h2>

      {prefs.email ? (
        <>
          <p className="mt-1.5 text-[13px] leading-snug text-primary-500">
            We email you at <span className="font-semibold text-primary-800 break-all">{prefs.email}</span> about your games. Only you see this.
          </p>
          {prefs.suppressed && (
            <p className="mt-2 rounded-xl bg-hot-500/10 px-3 py-2 text-[13px] leading-snug text-hot-600" role="status">
              Emails to this address bounced or were marked as spam, so we stopped sending them. If that&rsquo;s a mistake, write to info@tapturf.in.
            </p>
          )}
          <div className="mt-2 divide-y divide-primary-100">
            {EMAIL_GROUPS.map((g) => {
              const on = prefs[g];
              return (
                <div key={g}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-busy={busy === g}
                  disabled={!!busy}
                  onClick={() => void flip(g)}
                  className="w-full min-h-14 py-3 flex items-center justify-between gap-4 text-left cursor-pointer disabled:cursor-wait focus-neon rounded-xl"
                >
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-primary-800">{GROUP_LABEL[g]}</span>
                    <span className="block text-[12px] text-primary-500 mt-0.5 leading-snug">{GROUP_DETAIL[g]}</span>
                  </span>
                  <span className={`relative w-[51px] h-[31px] rounded-full shrink-0 transition-colors ${on ? "bg-accent-500" : "bg-primary-300"}`} aria-hidden>
                    <span
                      className={`absolute top-[2px] left-[2px] grid place-items-center w-[27px] h-[27px] bg-white rounded-full shadow-sm motion-safe:transition-transform motion-safe:duration-200 ${on ? "translate-x-[20px]" : ""}`}
                    >
                      {busy === g && <Loader2 className="w-3.5 h-3.5 text-accent-600 animate-spin" />}
                    </span>
                  </span>
                </button>
                </div>
              );
            })}
          </div>
          {error && (
            <p className="mt-1 text-[12px] font-medium text-hot-600" role="alert">
              {error}
            </p>
          )}
          <p className="mt-2 text-[12px] leading-snug text-primary-500">
            Every email also has a link to turn it off.{" "}
            <Link href="/privacy#emails" className="font-semibold text-primary-700 underline underline-offset-2">
              Privacy
            </Link>
          </p>
        </>
      ) : (
        <p className="mt-1.5 text-[13px] leading-snug text-primary-500">
          {byPhone && user.googleLinkable
            ? "Add your Google account under Email above, and we’ll email you about your games."
            : "We email only an address Google has confirmed, and this account has none yet."}
        </p>
      )}
    </section>
  );
}
