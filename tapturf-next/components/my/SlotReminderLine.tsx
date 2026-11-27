"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getEmailPrefs, patchEmailPrefs, quietToken } from "@/lib/account/client";
import { SLOT_LINE } from "@/lib/email/slotReminder";
import type { EmailPrefsResponse } from "@/lib/email/types";

/**
 * One quiet line under the Free slots editor on myTapturf: whether the
 * owner gets email reminders to update their slots, and the switch
 * (20261129_slot_reminders.sql; the same switch as "Reminders to update
 * your free slots" on the Me tab, through /api/account/emails). Shown only
 * to an account that runs a claimed turf and has an address we email (one
 * Google confirmed, not bounced): anyone else gets no reminder, so the
 * line would not be true. Nothing shows before the database has slot
 * reminders, while the read is out, or when it fails.
 */
export function SlotReminderLine() {
  const { getToken, signedInWith } = useAuth();
  const [prefs, setPrefs] = useState<EmailPrefsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // Read quietly (a failed read never signs anyone out); the change uses getToken.
  const readToken = quietToken(signedInWith);

  const load = useCallback(async () => {
    const tok = await readToken();
    if (!("token" in tok)) return;
    const a = await getEmailPrefs(tok.token);
    if (a.status === 200 && "ready" in a.body) setPrefs(a.body);
  }, [readToken]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!prefs?.ready || !prefs.email || prefs.suppressed || prefs.slots === null) return null;
  const on = prefs.slots;

  const flip = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const tok = await getToken();
      const a = "token" in tok ? await patchEmailPrefs(tok.token, { slots: !on }) : null;
      if (a && a.status === 200 && "ready" in a.body) setPrefs(a.body);
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <p id="slot-reminders" className="mt-1 text-[12px] leading-snug text-primary-400">
      {on ? SLOT_LINE.on : SLOT_LINE.off}{" "}
      {/* 44px to tap, the line's height unchanged (the negative margin takes the extra back). */}
      <button
        type="button"
        onClick={() => void flip()}
        disabled={busy}
        aria-busy={busy}
        className="-my-[14px] inline-flex min-h-11 items-center font-semibold text-accent-700 hover:underline cursor-pointer touch-manipulation disabled:cursor-wait disabled:opacity-60"
      >
        {on ? SLOT_LINE.turnOff : SLOT_LINE.turnOn}
      </button>
      {failed && (
        <span role="alert" className="block mt-1 font-medium text-hot-600">
          {SLOT_LINE.failed}
        </span>
      )}
    </p>
  );
}
