import { clockText, dayText, escapeHtml, mapsLink, namesText, oneLine, priceText, sportText, venueLine, venueName, whenRange, whenText } from "./format";
import type { EmailGame, EmailJob, RenderedEmail } from "./types";

/**
 * The six emails (20261110_email.sql), as pure functions: an email_claim
 * job in, {subject, preheader, html, text} out. Mobile first: one column at
 * most 560 px wide, inline styles only (mail apps drop style sheets), a
 * light background, TapTurf's green (#15803D, the site's accent-600, white
 * text on it reads at 5:1), one button. No images, no pixels, no tracking
 * links, no scripts: every link goes straight to its page. Every word a
 * person typed (names, venues, cities) is escaped. Days and times are the
 * game's, in India time: "Sat 15 Nov, 7 PM". Relative imports only (npm
 * run test:email).
 */

/** The two links each email carries: the site, and the signed link that turns these emails off. */
export type EmailLinks = { site: string; off: string };

type Fact = { label: string; value: string; link?: { label: string; href: string } };

type Content = {
  subject: string;
  preheader: string;
  title: string;
  paragraphs: string[];
  /** Names, one per line (the requests). */
  list?: string[];
  facts?: Fact[];
  button: { label: string; path: string };
  /** Why they got it: one sentence. */
  why: string;
  /** The footer link's words. */
  offLabel: string;
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const GREEN = "#15803D";
const INK = "#1D1D1F";
const BODY = "#3F3F46";
const MUTED = "#6E6E73";
const LINE = "#E5E7EB";
const PAGE = "#F3F4F6";
const PANEL = "#F9FAFB";

/** An https link on TapTurf for a path the database sent (a leading slash, no scheme, no other host). */
function siteLink(site: string, path: string): string {
  return /^\/(?![/\\])[A-Za-z0-9\-._~!$&'()*+,;=:@/?%]*$/.test(path) ? `${site}${path}` : `${site}/`;
}

/** The game's facts: when, where (with its map), the price, the host, who is in. */
function gameFacts(g: EmailGame, o: { host?: boolean; players?: boolean } = {}): Fact[] {
  const facts: Fact[] = [{ label: "When", value: whenRange(g) || "See the game page" }];
  const map = mapsLink(g.venue);
  const where = venueLine(g.venue);
  facts.push({ label: "Where", value: where, ...(map ? { link: { label: "Open in Google Maps", href: map } } : {}) });
  const price = priceText(g.price_per_player);
  if (price) facts.push({ label: "Price", value: price });
  const host = oneLine(g.host_first, 40);
  if (o.host !== false && host) facts.push({ label: "Host", value: host });
  if (o.players && typeof g.players === "number" && typeof g.max_players === "number" && g.max_players > 0) {
    facts.push({ label: "Players", value: `${g.players} of ${g.max_players} in` });
  }
  return facts;
}

const hello = (name: string | null | undefined) => {
  const n = oneLine(name, 40);
  return n ? `Hi ${n},` : "Hi,";
};

/* ------------------------------------------------------------------ */
/* The six                                                             */
/* ------------------------------------------------------------------ */

function welcome(job: EmailJob): Content {
  const n = oneLine(job.name, 40);
  return {
    subject: "Welcome to TapTurf",
    preheader: "Find a turf near you, or a game to join.",
    title: n ? `Welcome to TapTurf, ${n}` : "Welcome to TapTurf",
    paragraphs: [
      "TapTurf lists turfs and courts across India with their prices, hours and numbers to call or WhatsApp.",
      "You can also host a game or join one near you. When you host, we email you when players ask to join, and remind you the day before.",
    ],
    button: { label: "Find a game", path: "/games" },
    why: "You made a TapTurf account with this Google address.",
    offLabel: "Turn off all TapTurf emails",
  };
}

function joinRequest(job: EmailJob, g: EmailGame): Content {
  const names = (job.requests ?? []).map((r) => r.name);
  const many = names.length > 1;
  const sport = sportText(g.sport);
  const day = dayText(g.date);
  return {
    subject: many ? `${names.length} players want to join your ${sport} game` : `${oneLine(names[0], 40) || "A player"} wants to join your ${sport} game`,
    preheader: `${whenText(g.date, g.start_time)} at ${venueName(g.venue)}. Accept or decline on the game page.`,
    title: many ? `${names.length} players want to join` : `${oneLine(names[0], 40) || "A player"} wants to join`,
    paragraphs: [
      hello(job.name),
      many
        ? `These players asked to join your ${sport} game${day ? ` on ${day}` : ""}:`
        : `${namesText(names)} asked to join your ${sport} game${day ? ` on ${day}` : ""}.`,
    ],
    list: many ? names.map((x) => oneLine(x, 60)).filter(Boolean) : undefined,
    facts: gameFacts(g, { host: false, players: true }),
    button: { label: many ? "Answer the requests" : "Accept or decline", path: job.path },
    why: "You host this game on TapTurf.",
    offLabel: "Turn off join request emails",
  };
}

function requestWaiting(job: EmailJob, g: EmailGame): Content {
  const names = (job.requests ?? []).map((r) => r.name);
  const many = names.length > 1;
  const sport = sportText(g.sport);
  return {
    subject: many ? `${names.length} players are still waiting to hear from you` : `${oneLine(names[0], 40) || "A player"} is still waiting to hear from you`,
    preheader: `Your ${sport} game, ${whenText(g.date, g.start_time)}.`,
    title: many ? "Requests still waiting" : "A request is still waiting",
    paragraphs: [
      hello(job.name),
      `${namesText(names)} asked to join your ${sport} game and ${many ? "are" : "is"} still waiting. A quick yes or no helps them plan.`,
    ],
    facts: gameFacts(g, { host: false, players: true }),
    button: { label: many ? "Answer the requests" : "Answer the request", path: job.path },
    why: "You host this game on TapTurf.",
    offLabel: "Turn off join request emails",
  };
}

function requestAccepted(job: EmailJob, g: EmailGame): Content {
  const sport = sportText(g.sport);
  const host = oneLine(g.host_first, 40) || "The host";
  return {
    subject: `You're in: ${sport} on ${whenText(g.date, g.start_time)}`,
    preheader: `${venueLine(g.venue)}. See you there.`,
    title: "You're in",
    paragraphs: [hello(job.name), `${host} accepted your request to join ${sport}. Here are the details.`],
    facts: gameFacts(g, { players: true }),
    button: { label: "See the game", path: job.path },
    why: "You asked to join this game on TapTurf.",
    offLabel: "Turn off join request emails",
  };
}

function gameCancelled(job: EmailJob, g: EmailGame): Content {
  const sport = sportText(g.sport);
  const host = oneLine(g.host_first, 40) || "The host";
  const when = whenText(g.date, g.start_time);
  return {
    subject: `Cancelled: ${sport} on ${when}`,
    preheader: `${host} called off the game at ${venueName(g.venue)}.`,
    title: "Game cancelled",
    paragraphs: [
      hello(job.name),
      `${host} cancelled ${sport} on ${when} at ${venueLine(g.venue)}. You don't need to do anything.`,
    ],
    button: { label: "Find another game", path: "/games" },
    why: "You were in this game, or asked to join it, on TapTurf.",
    offLabel: "Turn off game change emails",
  };
}

function gameChanged(job: EmailJob, g: EmailGame): Content {
  const sport = sportText(g.sport);
  const host = oneLine(g.host_first, 40) || "The host";
  const changes = new Set(job.changes ?? []);
  const venue = changes.has("venue");
  const time = changes.has("time") || !venue;
  const was = whenText(job.from?.date, job.from?.start_time);
  const now = whenText(g.date, g.start_time);
  const both = venue && time;
  const title = both ? "Your game moved" : venue ? "New venue for your game" : "New day or time for your game";
  const subject = both
    ? `${sport} moved to ${now} at ${venueName(g.venue)}`
    : venue
      ? `New venue: ${sport} on ${now} is at ${venueName(g.venue)}`
      : `New time: ${sport} is now ${now}`;
  const said = [
    time ? `${host} changed the day or time${was && was !== now ? `. It was ${was}` : ""}.` : null,
    venue ? `${host} moved it to ${venueLine(g.venue)}.` : null,
  ].filter((x): x is string => !!x);
  return {
    subject,
    preheader: `${sport}: ${now} at ${venueName(g.venue)}.`,
    title,
    paragraphs: [hello(job.name), ...said, "Here is the game as it is now."],
    facts: gameFacts(g),
    button: { label: "See the game", path: job.path },
    why: "You are in this game, or asked to join it, on TapTurf.",
    offLabel: "Turn off game change emails",
  };
}

function reminder(job: EmailJob, g: EmailGame): Content {
  const sport = sportText(g.sport);
  const tomorrow = job.when !== "soon";
  const clock = clockText(g.start_time);
  const host = oneLine(g.host_first, 40);
  return {
    subject: tomorrow ? `Tomorrow: ${sport} at ${clock}, ${venueName(g.venue)}` : `In about 3 hours: ${sport} at ${clock}, ${venueName(g.venue)}`,
    preheader: `${whenText(g.date, g.start_time)} at ${venueLine(g.venue)}.`,
    title: tomorrow ? "Your game is tomorrow" : "Your game starts in about 3 hours",
    paragraphs: [
      hello(job.name),
      job.you_host ? `You're hosting ${sport}.` : host ? `${host} is hosting ${sport}.` : `${sport} is on.`,
      tomorrow ? "Here are the details for tomorrow." : "Time to get ready. Here are the details.",
    ],
    facts: gameFacts(g, { host: !job.you_host, players: true }),
    button: { label: "See the game", path: job.path },
    why: job.you_host ? "You host this game on TapTurf." : "You are in this game on TapTurf.",
    offLabel: "Turn off reminder emails",
  };
}

/** What a job says, or null when the job can't be written (a game email without its game). */
export function contentOf(job: EmailJob): Content | null {
  if (job.kind === "welcome") return welcome(job);
  const g = job.game;
  if (!g || !g.id) return null;
  switch (job.kind) {
    case "join_request":
      return joinRequest(job, g);
    case "request_waiting":
      return requestWaiting(job, g);
    case "request_accepted":
      return requestAccepted(job, g);
    case "game_cancelled":
      return gameCancelled(job, g);
    case "game_changed":
      return gameChanged(job, g);
    case "reminder":
      return reminder(job, g);
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* HTML and text                                                       */
/* ------------------------------------------------------------------ */

const p = (text: string, extra = "") =>
  `<p style="margin:0 0 14px 0;font-family:${FONT};font-size:16px;line-height:1.5;color:${BODY};${extra}">${escapeHtml(text)}</p>`;

function factsHtml(facts: Fact[]): string {
  const rows = facts
    .map(
      (f) =>
        `<tr><td valign="top" style="padding:8px 12px 8px 0;width:64px;font-family:${FONT};font-size:13px;line-height:1.4;color:${MUTED};">${escapeHtml(f.label)}</td>` +
        `<td valign="top" style="padding:8px 0;font-family:${FONT};font-size:15px;line-height:1.4;color:${INK};font-weight:600;">${escapeHtml(f.value)}` +
        (f.link
          ? `<br><a href="${escapeHtml(f.link.href)}" style="font-weight:600;font-size:14px;color:${GREEN};text-decoration:underline;">${escapeHtml(f.link.label)}</a>`
          : "") +
        `</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px 0;background:${PANEL};border:1px solid ${LINE};border-radius:12px;"><tr><td style="padding:6px 16px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr></table>`;
}

function listHtml(items: string[]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px 0;">${items
    .map((i) => `<tr><td style="padding:3px 0;font-family:${FONT};font-size:16px;line-height:1.4;color:${INK};font-weight:600;">&#8226;&nbsp;${escapeHtml(i)}</td></tr>`)
    .join("")}</table>`;
}

function buttonHtml(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 2px 0;"><tr><td align="center" bgcolor="${GREEN}" style="border-radius:999px;background:${GREEN};">` +
    `<a href="${escapeHtml(href)}" data-button="1" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:700;line-height:1.2;color:#FFFFFF;text-decoration:none;border-radius:999px;">${escapeHtml(label)}</a>` +
    `</td></tr></table>`;
}

function html(c: Content, links: EmailLinks): string {
  const button = siteLink(links.site, c.button.path);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(c.subject)}</title></head>
<body style="margin:0;padding:0;background:${PAGE};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${PAGE};">${escapeHtml(c.preheader)}${"&#8203;&nbsp;".repeat(30)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE};"><tr><td align="center" style="padding:24px 12px 32px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:0 4px 14px 4px;font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:-0.3px;color:${GREEN};">TapTurf</td></tr>
<tr><td style="background:#FFFFFF;border:1px solid ${LINE};border-radius:16px;padding:28px 22px 26px 22px;">
<h1 style="margin:0 0 14px 0;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:700;color:${INK};">${escapeHtml(c.title)}</h1>
${c.paragraphs.map((x) => p(x)).join("\n")}
${c.list?.length ? listHtml(c.list) : ""}
${c.facts?.length ? factsHtml(c.facts) : ""}
${buttonHtml(c.button.label, button)}
</td></tr>
<tr><td style="padding:20px 8px 0 8px;font-family:${FONT};font-size:13px;line-height:1.5;color:${MUTED};">
<p style="margin:0 0 8px 0;">${escapeHtml(c.why)} <a href="${escapeHtml(links.off)}" style="color:${MUTED};text-decoration:underline;">${escapeHtml(c.offLabel)}</a></p>
<p style="margin:0;">Reply to this email to reach TapTurf.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function text(c: Content, links: EmailLinks): string {
  const lines = [c.title, "", ...c.paragraphs.flatMap((x) => [x, ""])];
  if (c.list?.length) lines.push(...c.list.map((x) => `- ${x}`), "");
  if (c.facts?.length) {
    for (const f of c.facts) {
      lines.push(`${f.label}: ${f.value}`);
      if (f.link) lines.push(`Map: ${f.link.href}`);
    }
    lines.push("");
  }
  lines.push(`${c.button.label}: ${siteLink(links.site, c.button.path)}`, "", "--", c.why, `${c.offLabel}: ${links.off}`, "Reply to this email to reach TapTurf.");
  return lines.join("\n");
}

/** The email for a job, or null when it can't be written. */
export function renderEmail(job: EmailJob, links: EmailLinks): RenderedEmail | null {
  const c = contentOf(job);
  if (!c) return null;
  const subject = oneLine(c.subject, 140);
  return { subject, preheader: oneLine(c.preheader, 140), html: html({ ...c, subject }, links), text: text(c, links) };
}
