/**
 * What the game page offers the person looking at it. One value drives
 * the mobile bar, the desktop card, the "Your spot?" chip in the lineup
 * and the status note, so they never disagree.
 */
export type CtaState = "host" | "cancelled" | "ended" | "accepted" | "pending" | "declined" | "full" | "live" | "open";

export type CtaInput = {
  /** The signed-in person created this game. */
  isHost: boolean;
  /** games.status. */
  status: string | null | undefined;
  /** getGameStatus(): upcoming, live or expired (30 min after the end on the day, as today). */
  timing: "upcoming" | "live" | "expired";
  /** The signed-in person is in game_participants. */
  isParticipant: boolean;
  /** This visit's join request: "sent" once it went through. */
  joinStatus: "idle" | "sent" | "error";
  /** Their latest request for this game, read on load (null when none or not read). */
  myRequest: { status: string } | null;
  spotsLeft: number;
};

/**
 * In this order: host, cancelled, ended, accepted, pending, declined,
 * full, live, open. Host, ended, full and open keep the old page's
 * order; the rest are new.
 */
export function ctaState(i: CtaInput): CtaState {
  if (i.isHost) return "host";
  if (i.status === "cancelled") return "cancelled";
  if (i.timing === "expired") return "ended";
  if (i.isParticipant || i.myRequest?.status === "accepted") return "accepted";
  if (i.joinStatus === "sent" || i.myRequest?.status === "pending") return "pending";
  if (i.myRequest?.status === "declined") return "declined";
  if (i.spotsLeft <= 0) return "full";
  if (i.timing === "live") return "live";
  return "open";
}

/** States where a player can still ask to join (the main button and the "Your spot?" chip). */
export function canRequest(state: CtaState): boolean {
  return state === "open" || state === "live";
}

/**
 * Who sees the host's number on the game page: the host and the players
 * they accepted. Switch back to "anyone signed in" here and nowhere else.
 * (The row still reaches every browser through getGameById's select("*"):
 * hiding it here is not the privacy line, a server check is the follow-up.)
 */
export function canSeeHostNumber(v: { isHost: boolean; isParticipant: boolean; signedIn: boolean }): boolean {
  return v.signedIn && (v.isHost || v.isParticipant);
}

/** wa.me needs the country code: a bare 10-digit Indian number gets 91 in front. */
export function waNumber(phone: string): string {
  const d = phone.replace(/[^0-9]/g, "");
  return d.length === 10 ? `91${d}` : d;
}
