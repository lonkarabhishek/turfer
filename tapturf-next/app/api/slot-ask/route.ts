import { postSlotAsk } from "@/lib/slotAsk/route";

// One "Ask for a slot" from a turf page (components/turf/SlotAskSheet.tsx; lib/slotAsk/route.ts has the rules), sent
// as the tap opens WhatsApp and never waited on. Stored with nothing about the player: the turf, the day and time
// asked for, how long, the sport and the group size. The message itself goes from the player's WhatsApp to the turf
// and is never sent here. Never cached.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return postSlotAsk(req);
}
