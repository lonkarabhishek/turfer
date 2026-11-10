/**
 * Emails (supabase/migrations/20261110_email.sql): the six the site owner
 * approved, sent through Resend from /api/email/dispatch. Types and
 * constants shared by the sender, the templates and the Me tab. No imports.
 *
 *   GET   /api/account/emails                   -> EmailPrefsResponse (the caller's own)
 *   PATCH /api/account/emails  { requests?, changes?, reminders? } -> EmailPrefsResponse
 *   GET   /email/off?t=<token>                   the link in an email: what it turns off, and a button
 *   POST  /email/off?t=<token>                   turns it off (the button, or a mail app's one-click)
 *   POST  /api/email/dispatch                    from the database (x-revalidate-secret)
 *   POST  /api/email/webhook                     from Resend (Svix signature): bounces and complaints
 */

/** What an email is about: one per outbox kind (private.email_outbox.kind). */
export type EmailKind = "welcome" | "join_request" | "request_waiting" | "request_accepted" | "game_cancelled" | "game_changed" | "reminder";

/** The Me tab's three switches, and all of them (the Welcome email's link). */
export type EmailGroup = "requests" | "changes" | "reminders";
export type OffGroup = EmailGroup | "all";

export const EMAIL_GROUPS: readonly EmailGroup[] = ["requests", "changes", "reminders"];

/** The switch each kind belongs to (private.email_group); Welcome has none, its link turns off all. */
export const GROUP_OF: Record<EmailKind, EmailGroup | null> = {
  welcome: null,
  join_request: "requests",
  request_waiting: "requests",
  request_accepted: "requests",
  game_cancelled: "changes",
  game_changed: "changes",
  reminder: "reminders",
};

/** The switches' names, on the Me tab and on the page a link opens. */
export const GROUP_LABEL: Record<OffGroup, string> = {
  requests: "Join requests and answers",
  changes: "Game changes",
  reminders: "Reminders",
  all: "All TapTurf emails",
};

/** What each switch covers, in a line. */
export const GROUP_DETAIL: Record<OffGroup, string> = {
  requests: "When someone asks to join your game, a request still waiting, and when a host lets you in.",
  changes: "When a game you are in or asked to join is cancelled, or its venue, day or time changes.",
  reminders: "The day before a game and about 3 hours before it starts.",
  all: "Every email from TapTurf about your account and your games.",
};

/** CLAIM_MAX: the most emails one claim leases (private.email_claim_max()). */
export const CLAIM_MAX = 20;

/** Where links in an email go. Emails always link to the live site. */
export const SITE = "https://www.tapturf.in";

/** A game's place, as email_claim sends it: a TapTurf turf's facts, or the venue its host typed. */
export type EmailVenue = {
  name: string | null;
  area: string | null;
  city: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  /** A typed venue's own Google Maps link. */
  maps_url: string | null;
  turf_slug: string | null;
};

export type EmailGame = {
  id: string;
  sport: string | null;
  /** YYYY-MM-DD, India time, as stored. */
  date: string;
  /** HH:MM, India time, as stored. */
  start_time: string | null;
  end_time: string | null;
  price_per_player: number | string | null;
  status: string | null;
  host_first: string | null;
  players: number | null;
  max_players: number | null;
  venue: EmailVenue;
};

/** One email to send, as email_claim leases it. Its address is used for this send only. */
export type EmailJob = {
  id: string;
  kind: EmailKind;
  user_id: string;
  to: string;
  /** The recipient's first name, when the account has one. */
  name: string | null;
  attempt: number;
  /** The page it opens, on TapTurf. */
  path: string;
  /** The recipient hosts the game. */
  you_host?: boolean;
  game?: EmailGame;
  /** reminder: tomorrow (the day before) or soon (about 3 hours before). */
  when?: "tomorrow" | "soon" | null;
  /** join_request, request_waiting: the players still waiting, by name. */
  requests?: { name: string }[];
  /** game_changed: what changed, and what the day and time were. */
  changes?: ("venue" | "time")[];
  from?: { date?: string; start_time?: string };
};

/** What a template makes. */
export type RenderedEmail = { subject: string; preheader: string; html: string; text: string };

/** The Me tab's Emails block: the caller's own. ready false: the database has no emails yet (the block hides). */
export type EmailPrefsResponse = {
  ready: boolean;
  /** The address we email, only when Google confirmed it; else null (the block says how to add one). */
  email: string | null;
  /** That address bounced or was marked as spam: nothing is sent to it. */
  suppressed: boolean;
  requests: boolean;
  changes: boolean;
  reminders: boolean;
};
