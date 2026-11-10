/**
 * The emails' mode and the admin's Emails card (20261110_email.sql:
 * private.email_settings 'mode', admin_email_status, admin_email_set_mode,
 * admin_email_test; components/admin/EmailsCard.tsx). Pure, no imports: the
 * card and the routes share it (npm run test:email).
 *
 *   GET  /api/admin/emails             -> EmailAdminAnswer (the site owner only)
 *   POST /api/admin/emails { mode }    -> EmailAdminAnswer
 *   POST /api/admin/emails/test { send: true } -> EmailTestAnswer: one of each email to the site owner's own address
 *
 * Nothing here holds an address or a name: the card shows counts only.
 */

/** off: nothing sent. owner_only: only the site owner's accounts (the file starts here). on: everyone. */
export type EmailMode = "off" | "owner_only" | "on";
export const EMAIL_MODES: readonly EmailMode[] = ["off", "owner_only", "on"];

export const isEmailMode = (x: unknown): x is EmailMode => typeof x === "string" && (EMAIL_MODES as readonly string[]).includes(x);

/** The three choices on the card. */
export const MODE_LABEL: Record<EmailMode, string> = { off: "Off", owner_only: "Test: only me", on: "On for everyone" };

/** What each choice means, in one line. */
export const MODE_DETAIL: Record<EmailMode, string> = {
  off: "No one gets an email. Emails that come due are skipped, never sent later.",
  owner_only: "Only your own accounts get emails. Everyone else's are skipped, never sent later.",
  on: "Everyone with a Google-confirmed email gets the emails they have on.",
};

/** Why an email was not sent (email_job's skips), in a few words. */
export const SKIP_LABEL: Record<string, string> = {
  test_mode: "Test mode, not you",
  mode_off: "Emails were off",
  answered: "Request answered first",
  cancelled: "Game cancelled",
  started: "Game had started",
  closed: "Game closed",
  gone: "Game gone",
  moved: "Game moved",
  late: "Too late to be true",
  no_change: "Change undone",
  not_in: "No longer in the game",
  off: "They turned it off",
  suppressed: "Bounced or marked spam",
  no_address: "No confirmed email",
  other: "Other",
};

export const skipLabel = (why: string): string => SKIP_LABEL[why] ?? why.replace(/_/g, " ");

/** Whether and why this deployment can't send: the key, production, the turn-off links' key. */
export type EmailSending = "ok" | "no_key" | "not_production" | "no_account_key";

export type EmailCounts = {
  sent: number;
  /** Waiting to go, or being sent. */
  queued: number;
  failed: number;
  /** Queued over 24 hours: never sent late. */
  expired: number;
  /** Not sent, by why, most first. */
  skipped: { why: string; n: number }[];
  skippedTotal: number;
};

export type EmailAdminStatus = {
  mode: EmailMode;
  /** When the mode last changed (or the file first ran). */
  modeSince: string | null;
  /** The last 24 hours and the last 7 days, by when each email was queued. */
  day: EmailCounts;
  week: EmailCounts;
  /** The last "Send me one of each". */
  testAt: string | null;
  sending: EmailSending;
};

export type EmailAdminAnswer = { ok: true; status: EmailAdminStatus } | { ok: false; error: "not_set_up" | "unavailable" | "forbidden" | "bad" };

const count = (x: unknown): number => {
  const n = typeof x === "number" ? x : typeof x === "string" && /^\d{1,12}$/.test(x) ? Number(x) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};
const time = (x: unknown): string | null => (typeof x === "string" && Number.isFinite(Date.parse(x)) ? x : null);

/** One window's counts as email_counts sends them, or null when it isn't one. */
export function countsOf(x: unknown): EmailCounts | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const c = x as Record<string, unknown>;
  const raw = c.skipped && typeof c.skipped === "object" && !Array.isArray(c.skipped) ? (c.skipped as Record<string, unknown>) : {};
  const skipped = Object.entries(raw)
    .map(([why, n]) => ({ why: why.slice(0, 40), n: count(n) }))
    .filter((s) => s.n > 0)
    .sort((a, b) => b.n - a.n || (a.why < b.why ? -1 : 1));
  return {
    sent: count(c.sent),
    queued: count(c.queued),
    failed: count(c.failed),
    expired: count(c.expired),
    skipped,
    skippedTotal: skipped.reduce((a, s) => a + s.n, 0),
  };
}

/** admin_email_status's (and admin_email_set_mode's) answer with this deployment's sending, or null when it isn't one. */
export function toEmailStatus(x: unknown, sending: EmailSending): EmailAdminStatus | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const d = x as Record<string, unknown>;
  if (d.r !== "ok" || !isEmailMode(d.mode)) return null;
  const day = countsOf(d.day);
  const week = countsOf(d.week);
  if (!day || !week) return null;
  return { mode: d.mode, modeSince: time(d.mode_since), day, week, testAt: time(d.test_at), sending };
}

/** What the card says about sending beyond the mode, or null when this deployment sends. */
export function sendingNote(s: EmailSending): string | null {
  if (s === "no_key") return "RESEND_API_KEY isn't set, so nothing is sent yet, whatever the mode.";
  if (s === "not_production") return "This deployment doesn't send emails: only the live site does.";
  if (s === "no_account_key") return "ACCOUNT_KEY isn't set, so no email can be sent.";
  return null;
}

/** The fold's line while closed: "Test: only me · 3 sent, 5 skipped in 24 hours". */
export function emailFoldLine(s: EmailAdminStatus): string {
  const d = s.day;
  const parts = [`${d.sent} sent`, d.skippedTotal ? `${d.skippedTotal} skipped` : "", d.failed ? `${d.failed} failed` : "", d.queued ? `${d.queued} queued` : ""].filter(Boolean);
  return `${MODE_LABEL[s.mode]} · ${parts.join(", ")} in 24 hours`;
}

/** The ten test emails, in the order they go: a key and what the card calls each. */
export const TEST_KINDS = [
  { key: "welcome", label: "Welcome" },
  { key: "join_request", label: "Join request" },
  { key: "join_requests", label: "Join requests, three together" },
  { key: "request_waiting", label: "Request still waiting" },
  { key: "request_accepted", label: "You're in" },
  { key: "game_changed", label: "Game changed" },
  { key: "game_cancelled", label: "Game cancelled" },
  { key: "reminder_tomorrow", label: "Reminder: tomorrow" },
  { key: "reminder_soon", label: "Reminder: in about 3 hours" },
  { key: "reminder_tonight", label: "Reminder: tonight, after midnight" },
] as const;

export type TestKey = (typeof TEST_KINDS)[number]["key"];

export type TestLine = { key: TestKey; label: string; result: "sent" | "retry" | "failed"; error?: string };

export type TestProblem = "no_key" | "not_production" | "no_account_key" | "no_address" | "wait" | "not_set_up" | "unavailable" | "forbidden";

export type EmailTestAnswer = { ok: true; results: TestLine[] } | { ok: false; reason: TestProblem; seconds?: number };

/** What the card says when a test sent nothing. */
export function testProblemText(reason: TestProblem, seconds?: number): string {
  switch (reason) {
    case "no_key":
      return "RESEND_API_KEY isn't set, so no email can be sent yet. Nothing was sent.";
    case "not_production":
      return "This deployment doesn't send emails: only the live site does. Nothing was sent.";
    case "no_account_key":
      return "ACCOUNT_KEY isn't set, so no email can be sent. Nothing was sent.";
    case "no_address":
      return "No TapTurf account has your Google address confirmed. Sign in with Google once, then try again.";
    case "wait": {
      const m = Math.max(1, Math.ceil((seconds ?? 600) / 60));
      return `You sent a test less than 10 minutes ago. Try again in ${m} ${m === 1 ? "minute" : "minutes"}.`;
    }
    case "not_set_up":
      return "Emails aren't set up in the database yet (20261110_email.sql).";
    case "forbidden":
      return "Only the site owner can do that.";
    default:
      return "Couldn't send. Reload admin and try again.";
  }
}

/** One test line's words: "Sent", "Not sent: 422 validation_error". */
export function testLineText(l: Pick<TestLine, "result" | "error">): string {
  if (l.result === "sent") return "Sent";
  return `Not sent${l.error ? `: ${l.error}` : ""}`;
}
