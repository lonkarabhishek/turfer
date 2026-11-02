import { postMapUse } from "@/lib/map/viewRoute";

// How many people use the map, for the admin (lib/map/views.ts says what
// counts): a view of /map, a card opened from it, or a turf page's "This
// turf on the map" opened. A guest's browser sends it as a beacon, a
// signed-in one as a keepalive fetch with the sign-in, which the server
// verifies quietly (lib/map/viewRoute.ts). Always 204 at once (400 for a
// body that isn't a use); counted after the reply. Never cached.

export const POST = postMapUse;
