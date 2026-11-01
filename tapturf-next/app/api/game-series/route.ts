import { getSeries, postSeries } from "@/lib/games/server";

// Repeat games, as the signed-in caller: start one (its first games go up)
// and list theirs (lib/games/server.ts postSeries and getSeries,
// lib/games/types.ts has the API).

export function POST(req: Request) {
  return postSeries(req);
}

export function GET(req: Request) {
  return getSeries(req);
}
