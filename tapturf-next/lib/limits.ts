/**
 * Per-instance soft limits shared by the API routes: the network a
 * request comes from, and a fixed-window counter. Relative imports only,
 * so unit tests compile it on their own.
 */

/** The eight groups of an IPv6 address, leading zeros dropped; null when it does not read as one. */
function ipv6Groups(ip: string): string[] | null {
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const parts = halves.map((h) => (h ? h.split(":") : []));
  // A dotted IPv4 ending (::ffff:1.2.3.4) is the last two groups.
  const last = parts[parts.length - 1];
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(last[last.length - 1] ?? "");
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    last.splice(-1, 1, ((a << 8) | b).toString(16), ((c << 8) | d).toString(16));
  }
  const zeros = 8 - parts[0].length - (parts[1]?.length ?? 0);
  if (parts.length === 2 ? zeros < 1 : zeros !== 0) return null;
  const groups = [...parts[0], ...Array<string>(parts.length === 2 ? zeros : 0).fill("0"), ...(parts[1] ?? [])];
  return groups.every((g) => /^[0-9a-f]{1,4}$/.test(g)) ? groups.map((g) => parseInt(g, 16).toString(16)) : null;
}

/**
 * The network the limits count by: the first x-forwarded-for hop
 * (Vercel overwrites the header, so it cannot be spoofed). For IPv6 only
 * the /64, since one phone or home router can use any address inside its
 * /64 and would otherwise get a fresh limit per address.
 */
export function clientNetwork(req: Request): string {
  const first = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim().toLowerCase();
  // A port or brackets, in case a proxy adds them: "1.2.3.4:5678", "[2001:db8::1]:443".
  const ip = first.replace(/^\[([^\]]+)\](?::\d+)?$/, "$1").replace(/^([\d.]+):\d+$/, "$1").split("%")[0];
  if (!ip) return "unknown";
  if (!ip.includes(":")) return ip;
  const g = ipv6Groups(ip);
  if (!g) return ip;
  // IPv4-mapped (::ffff:1.2.3.4) is an IPv4 client.
  if (g.slice(0, 5).every((x) => x === "0") && g[5] === "ffff") {
    const [hi, lo] = [parseInt(g[6], 16), parseInt(g[7], 16)];
    return [hi >> 8, hi & 255, lo >> 8, lo & 255].join(".");
  }
  return `${g.slice(0, 4).join(":")}::/64`;
}

/** Keys tracked per window at most: a soft limit must not grow memory without end under a flood of networks. */
export const MAX_TRACKED = 5_000;

/** Counts per key in fixed windows. All counts go when the window turns, so nothing needs sweeping. */
export function windowCounter(limit: number, windowMs: number, now: () => number) {
  let hits = new Map<string, number>();
  let since = now();
  return (key: string): boolean => {
    const t = now();
    if (t - since >= windowMs) {
      hits = new Map();
      since = t;
    }
    const n = hits.get(key) ?? 0;
    if (n >= limit) return false;
    if (n > 0 || hits.size < MAX_TRACKED) hits.set(key, n + 1);
    return true;
  };
}

