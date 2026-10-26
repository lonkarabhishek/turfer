import { readDevice, readUse } from "../tools/usage";
import { cityNote, visitCity } from "./city";
import { bearerToken, identify } from "./identity";
import { later } from "./route";
import { createAccountLimiter, readSmallJson, recordToolUse, resolveAccount } from "./server";

// One use of a free tool, for the admin (lib/tools/usage.ts), for
// app/api/tools/use. The browser never says who: a sign-in it sends is
// verified here as on every account route (identify, then the account it
// opens, never one made for it), and anything else is a guest's use under
// the browser's device tag. The reply goes out first; the check and the
// write come after it, so a tool is never slowed or broken by this.
// Relative imports only (npm run test:account).

const allow = createAccountLimiter(30);

/**
 * The account a verified sign-in opens, or null: a missing, invalid or
 * uncheckable token, or one that opens no account, makes it a guest's use.
 */
async function verifiedAccount(req: Request): Promise<string | null> {
  const id = await identify(req);
  if (!("ok" in id)) return null;
  const r = await resolveAccount(id.ok);
  return "ok" in r ? r.ok.id : null;
}

/** POST: 204 at once (429 over the per-network limit, 400 for a body that isn't a use); recorded after the reply. */
export async function postToolUse(req: Request): Promise<Response> {
  if (!allow(req)) return new Response(null, { status: 429 });
  const body = await readSmallJson(req, 600);
  const use = readUse(body);
  if (!use) return new Response(null, { status: 400 });
  const device = readDevice(body);
  const headers = new Headers(req.headers);
  const city = visitCity(cityNote((n) => headers.get(n)));
  const token = bearerToken(req);
  // Only the sign-in goes with the work after the reply.
  const signedIn = token ? new Request(req.url, { headers: { authorization: `Bearer ${token}` } }) : null;
  later(async () => {
    const userId = signedIn ? await verifiedAccount(signedIn) : null;
    await recordToolUse(use, { userId, device }, city);
  });
  return new Response(null, { status: 204 });
}
