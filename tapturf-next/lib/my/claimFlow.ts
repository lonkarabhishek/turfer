import { BOOKINGS_LINE } from "../turfPage/claimPrompts";

// Relative imports only, so node --test runs this (lib/my/claimFlow.test.ts, npm run test:my).

/**
 * The claim flow on /my?claim=<turf id>: one question first, before the
 * sign-in and before the form, "Do you own or manage <turf>?". Players who
 * tapped a claim link to book get the site owner's line (where the turf has
 * a number to contact) and go back to the turf's page; owners answer once (the answer rides along through the
 * sign-in as owner=1) and go on to the form.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A turf id from the claim link, lower-cased, or null for anything that isn't one. */
export function claimTurfId(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  return UUID.test(s) ? s.toLowerCase() : null;
}

/** Where "Yes, I run this turf" goes once signed in: the form, the question answered. */
export function claimOwnerUrl(turfId: string): string {
  return `/my?claim=${encodeURIComponent(turfId)}&owner=1`;
}

/** "Yes, I run this turf" when signed out: straight to the sign-in, which comes back to the form. */
export function claimLoginUrl(turfId: string): string {
  return `/login?next=${encodeURIComponent(claimOwnerUrl(turfId))}`;
}

/** The turf a sign-in is for, when its next is a claim (/my?claim=<id>...); else null. */
export function claimFromNext(next: string | null | undefined): string | null {
  const s = next ?? "";
  if (!s.startsWith("/my?")) return null;
  let q: URLSearchParams;
  try {
    q = new URLSearchParams(s.slice(4).split("#")[0]);
  } catch {
    return null;
  }
  return claimTurfId(q.get("claim"));
}

/** What owner_home says about this turf for the signed-in claimant (null: signed out, or not loaded). */
export type ClaimHomeState = { admin: boolean; status: "active" | "pending" | null; match: boolean };

/**
 * Whether to ask "Do you own or manage <turf>?". Not when they said yes
 * already (owner=1), nor for someone who already runs it or has a claim
 * waiting, the site owner, or a sign-in whose own number is on the
 * listing (those open it at once: one tap stays one tap).
 */
export function asksRunsQuestion({ saidOwner, home }: { saidOwner: boolean; home: ClaimHomeState | null }): boolean {
  if (saidOwner) return false;
  if (!home) return true;
  return !(home.admin || home.status === "active" || home.status === "pending" || home.match);
}

/** The turf's mobile as typed (+91, spaces, a leading 0 all fine), as 10 digits; null when it isn't a mobile. */
export function turfPhone10(input: string): string | null {
  const d = input.replace(/\D/g, "");
  const p10 = d.length > 10 ? d.slice(-10) : d;
  return /^[6-9]\d{9}$/.test(p10) ? p10 : null;
}

export const CLAIM_ROLES = ["owner", "manager", "staff"] as const;
export type ClaimRole = (typeof CLAIM_ROLES)[number];
export const ROLE_LABELS: Record<ClaimRole, string> = { owner: "Owner", manager: "Manager", staff: "Staff" };

/** The flow's words, kept here so the tests read them (lib/turfPage/claimPrompts.ts claimCopyProblem). */
export const CLAIM_FLOW_COPY = {
  label: "For turf owners and managers",
  question: (turf: string) => `Do you own or manage ${turf}?`,
  lead: "Owners and managers claim their turf's page on TapTurf to keep its prices, hours and numbers right. It's free.",
  yes: "Yes, I run this turf",
  yesSub: "Owner, manager or staff",
  no: "No, I want to play here",
  noSub: (hasNumber: boolean) => (hasNumber ? "Call, WhatsApp or get directions" : "Get directions, or tell us its number"),
  // The site owner's line only where there is a number to contact (as the turf page's bar, lib/turfPage/noContact.ts bookingLine).
  playTitle: (hasNumber: boolean) => (hasNumber ? BOOKINGS_LINE : "We don't have its number yet"),
  playBody: (turf: string, hasNumber: boolean) =>
    hasNumber
      ? `Call or WhatsApp ${turf} from its page.`
      : `${turf}'s page has directions, and if you know its number, tap I know the number there.`,
  playButton: (hasNumber: boolean) => (hasNumber ? "Call or WhatsApp on its page" : "Back to the turf's page"),
  playUndo: "I run this turf after all",
  loginTitle: (turf: string | null) => `Sign in to manage ${turf ?? "your turf"}`,
  loginLead: "For the turf's owner or manager. Free: see who finds its page, and keep its prices, hours and numbers right.",
  loginDefault: "Find turfs. Host games. Find a squad.",
  rolePick: (turf: string) => `Your role at ${turf}`,
  roleNeeded: "Pick Owner, Manager or Staff first.",
  byHandWhy: "This listing has no mobile number, so our team checks your claim by hand, usually within a day.",
  phoneLabel: "The turf's phone number",
  phoneHint: "The number players should call. Our team calls it to check that you run the turf. It isn't shown on the page.",
  phoneNeeded: "Enter the turf's 10-digit mobile number, like 98765 43210.",
  // The page shows a number, but none a code can go to (a landline, or a mobile an owner or a
  // suggestion put there): our team can call the page's number, and asks for a mobile at the turf.
  byHandWhyListed: "The number on this page can't get a code, so our team checks your claim by hand, usually within a day.",
  phoneLabelListed: "A mobile number at the turf",
  phoneHintListed: "Our team calls it to check that you run the turf. It isn't shown on the page.",
  phoneNeededListed: "Enter a 10-digit mobile number, like 98765 43210.",
  noteLabel: "Note for TapTurf's team (optional)",
  notePlaceholder: "e.g. I run it with my brother",
  sendForCheck: "Send for a check",
  thanks: (turf: string) => `Thanks. We'll check that you run ${turf}, usually within a day, and tell you here on TapTurf.`,
  thanksMore: "Once it's confirmed, it shows under Your turfs.",
  waiting: "We're checking that you run it, usually within a day",
} as const;
