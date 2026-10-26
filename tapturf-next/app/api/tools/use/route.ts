import { postToolUse } from "@/lib/account/toolRoutes";

// One use of a free tool, for the admin's counts and its list of who used
// what (lib/tools/usage.ts). A guest's browser sends it as a beacon, a
// signed-in one as a keepalive fetch with the sign-in, which the server
// verifies (lib/account/toolRoutes.ts). Recorded after the reply.

export const POST = postToolUse;
