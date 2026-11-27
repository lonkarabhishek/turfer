import { getUsername, postUsername } from "@/lib/account/usernameRoutes";

// GET ?u=<name>        whether that username is free for the caller
// GET ?suggest=1       the username TapTurf gave the caller, or a free one made from their name
// POST { keep: true }  the caller keeps the username TapTurf gave them
// lib/account/usernameRoutes.ts has the handlers, lib/account/types.ts the answers.

export function GET(req: Request) {
  return getUsername(req);
}

export function POST(req: Request) {
  return postUsername(req);
}
