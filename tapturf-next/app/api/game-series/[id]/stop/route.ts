import { stopSeries } from "@/lib/games/server";

// The host stops a repeat: no more games; { cancel: true } calls off its games not started yet too (lib/games/server.ts stopSeries).

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  return stopSeries(req, (await params).id);
}
