/**
 * The words of "Ask for a slot" a player reads on TapTurf: the turf
 * page's button and the sheet (components/turf/SlotAskSheet.tsx). They ask
 * and promise nothing: the turf answers on WhatsApp. Never "book" or
 * "booking" (BANNED_COPY, lib/seo/defaults.ts; npm run test:slotask runs
 * every line through it). No imports.
 */
export const ASK_COPY = {
  /** The turf page's button, where WhatsApp used to be. */
  entry: "Ask for a slot",
  title: "Ask for a slot",
  lead: "Pick a time. WhatsApp opens with your message, ready to edit. The turf replies there.",
  day: "Day",
  time: "Start time",
  howLong: "How long",
  sport: "Sport",
  players: "Players",
  playersHint: "Optional",
  fewer: "Fewer players",
  more: "More players",
  noPlayers: "Not set",
  send: "Send on WhatsApp",
  pickTime: "Pick a start time",
  /** The plain chat, one tap away. */
  justMessage: "Just message them",
  close: "Close",
  free: "Free",
  /** Under the times, when the owner's marks are fresh. */
  freeLegend: "Free: marked by the owner. Other hours may be open too, so ask.",
  /** On a turf that takes requests on TapTurf for its free hours (the pilot, components/turf/RequestSheet.tsx). */
  freeRequest: "Free: marked by the owner. Tap one to send the turf a request on TapTurf. For other hours, ask on WhatsApp.",
  /** The hours of a day whose hours we don't know. */
  guessed: "We don't have this turf's hours for this day, so these are the usual ones.",
  closed: (weekday: string) => `Closed on ${weekday}s. Pick another day.`,
  noneLeft: "No hours left today. Pick another day.",
  afterMidnight: "After midnight",
  /** Under the button, signed out: Send is behind the page's own sign-in. */
  signIn: "Quick sign-in first. Your choice is kept.",
  /** In the lead's place, back from that sign-in. */
  back: "You're signed in. Send your message.",
  hours: (minutes: number) => (minutes === 60 ? "1 h" : minutes === 90 ? "1.5 h" : `${minutes / 60} h`),
} as const;
