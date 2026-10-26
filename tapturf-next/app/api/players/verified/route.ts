import { createReadOnlyClient } from "@/lib/supabase/server";
import { createAccountLimiter } from "@/lib/account/server";
import { verifiedGet } from "@/lib/account/verifiedRoute";

// GET ?ids=<uuid>,... -> { verified: [<uuid>, ...] }: which of these
// accounts show the verified tick. Public and cached by the CDN for a
// minute (lib/account/verifiedRoute.ts has the rules).

const allow = createAccountLimiter(120);

export function GET(req: Request) {
  return verifiedGet(req, (ids) => createReadOnlyClient().rpc("users_verified", { p_ids: ids }), allow);
}
