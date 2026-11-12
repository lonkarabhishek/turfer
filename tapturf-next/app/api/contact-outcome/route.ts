import { freeCards } from "@/lib/availability/free";
import { postOutcome } from "@/lib/outcome/route";
import { getFreeSlots } from "@/lib/queries/freeSlots";

// A player's answer to "Did you get a slot?", asked once after a Call or WhatsApp tap when they are back
// (components/outcome/OutcomeCard.tsx; lib/outcome/route.ts has the rules). Stored with nothing about the player:
// the turf, call or WhatsApp, where the tap was, the answer, and the time they play or wanted. After "Slot was
// full" the answer says whether the turf's city has free hours marked now (the lists' own cached read of all of
// India, lib/queries/freeSlots.ts), so the card can link to them. Never cached.

export const dynamic = "force-dynamic";

const hasFree = async (city: string) => {
  const { rows } = await getFreeSlots(null);
  return freeCards(rows.filter((r) => r.city?.trim().toLowerCase() === city), Date.now()).size > 0;
};

export async function POST(req: Request) {
  return postOutcome(req, { hasFree });
}
