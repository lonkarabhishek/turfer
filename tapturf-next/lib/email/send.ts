import { CONTACT_EMAIL } from "../contact";
import type { EmailKind, RenderedEmail } from "./types";

/**
 * Sending one email through Resend's HTTP API (POST /emails) with fetch:
 * no SDK. Relative imports only (npm run test:email).
 *
 * Sends only with RESEND_API_KEY set and on Vercel's production
 * deployment (VERCEL_ENV=production). Off Vercel, EMAIL_API_BASE (an http
 * or https address on 127.0.0.1 or localhost) points the sends at a local
 * stand-in instead; on Vercel it is ignored, so a value copied there can
 * never send anywhere but Resend. From: EMAIL_FROM, else TapTurf
 * <hello@tapturf.in>; Reply-To: info@tapturf.in (lib/contact.ts). One
 * recipient per send: never another person's address in To, CC or
 * Reply-To.
 */

export const RESEND_API = "https://api.resend.com";
export const DEFAULT_FROM = "TapTurf <hello@tapturf.in>";

type Env = Record<string, string | undefined>;

export type EmailConfig =
  | { ok: true; apiKey: string; base: string; from: string; replyTo: string }
  | { ok: false; reason: "no_key" | "not_production" };

/** A local stand-in for Resend: honoured only off Vercel. */
export function testApiBase(env: Env): string | null {
  const v = env.EMAIL_API_BASE?.trim();
  if (!v || env.VERCEL) return null;
  try {
    const u = new URL(v);
    if ((u.protocol === "http:" || u.protocol === "https:") && (u.hostname === "127.0.0.1" || u.hostname === "localhost")) return v.replace(/\/+$/, "");
  } catch {
    /* not a URL */
  }
  return null;
}

/** "Name <addr@tapturf.in>" or "addr@tapturf.in" on our own domain; anything else falls back to the default. */
export function fromOf(env: Env): string {
  const v = env.EMAIL_FROM?.trim();
  if (!v || v.length > 120) return DEFAULT_FROM;
  return /^(?:[A-Za-z0-9 .'-]{1,60} <)?[A-Za-z0-9._%+-]+@tapturf\.in>?$/.test(v) && (v.includes("<") === v.endsWith(">")) ? v : DEFAULT_FROM;
}

/** Whether, and where, this deployment sends. */
export function emailConfig(env: Env = process.env): EmailConfig {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, reason: "no_key" };
  const base = env.VERCEL_ENV === "production" ? RESEND_API : testApiBase(env);
  if (!base) return { ok: false, reason: "not_production" };
  return { ok: true, apiKey, base, from: fromOf(env), replyTo: CONTACT_EMAIL };
}

export type SendResult = { result: "sent"; id: string | null } | { result: "retry" | "failed"; error: string };

export type Message = {
  /** The outbox row's id: Resend's Idempotency-Key, so a retry of a send that went out is not sent twice. */
  id: string;
  kind: EmailKind;
  to: string;
  email: RenderedEmail;
  /** The signed https link that turns these emails off. */
  offUrl: string;
};

const TIMEOUT_MS = 10_000;

/** The request body Resend gets for one message. */
export function resendBody(cfg: Extract<EmailConfig, { ok: true }>, m: Message) {
  return {
    from: cfg.from,
    to: [m.to],
    reply_to: cfg.replyTo,
    subject: m.email.subject,
    html: m.email.html,
    text: m.email.text,
    headers: {
      "List-Unsubscribe": `<${m.offUrl}>, <mailto:${CONTACT_EMAIL}?subject=Unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    tags: [{ name: "kind", value: m.kind }],
  };
}

/**
 * One send. sent: Resend took it (its id). retry: try again later (rate
 * limited, Resend down, our key refused, a timeout). failed: Resend will
 * never take it (a bad address). Never throws.
 */
export async function sendEmail(cfg: Extract<EmailConfig, { ok: true }>, m: Message, f: typeof fetch = fetch): Promise<SendResult> {
  let res: Response;
  try {
    res = await f(`${cfg.base}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": m.id },
      body: JSON.stringify(resendBody(cfg, m)),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return { result: "retry", error: `network: ${e instanceof Error ? e.name : "error"}` };
  }
  let body: Record<string, unknown> = {};
  try {
    body = ((await res.json()) ?? {}) as Record<string, unknown>;
  } catch {
    /* not JSON */
  }
  const name = typeof body.name === "string" ? body.name.slice(0, 60) : "";
  if (res.status >= 200 && res.status < 300) return { result: "sent", id: typeof body.id === "string" ? body.id.slice(0, 100) : null };
  // The same key with another payload: Resend already took this email once.
  if (res.status === 409 && name === "invalid_idempotent_request") return { result: "sent", id: null };
  const error = `${res.status}${name ? ` ${name}` : ""}`;
  // A bad address or a message Resend can't take: never again. Our own key or limits: later.
  if (res.status === 400 || res.status === 422) return { result: "failed", error };
  return { result: "retry", error };
}
