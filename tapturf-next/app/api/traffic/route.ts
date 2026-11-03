import { postTraffic } from "@/lib/traffic/route";

// TapTurf's own page view and visit count, for the admin's Traffic section
// (lib/traffic/traffic.ts says what counts). Every page sends one view as a
// beacon, or a keepalive fetch with the sign-in when signed in, which the
// server verifies quietly only to count signed-in views and to leave the
// site owner's own out (lib/traffic/route.ts). Always 204 at once (400 for a
// body that isn't a view); counted after the reply. Never cached.

export const POST = postTraffic;
