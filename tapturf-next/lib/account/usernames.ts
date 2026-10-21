/**
 * Username rules, the same as the database's (private.username_problem),
 * so the form can say what is wrong before asking the server. The server
 * still decides. Pure, relative imports only (npm run test:account).
 */

/** As typed: ASCII letters, digits and underscores, 3 to 20, starting with a letter. Lowercased after. */
export const USERNAME_INPUT_RE = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;

const RESERVED = new Set([
  "about", "account", "accounts", "api", "app", "auth", "blog", "c", "contact", "dashboard",
  "everyone", "game", "games", "help", "here", "home", "live", "login", "logout", "me", "mod",
  "moderator", "my", "near", "nearme", "null", "official", "owner", "owners", "privacy",
  "profile", "register", "robots", "root", "settings", "signin", "signup", "sitemap", "sport",
  "sports", "staff", "support", "system", "team", "terms", "tool", "tools", "turf", "turfs",
  "u", "undefined", "user", "users", "www",
]);

export type UsernameProblem = "bad" | "reserved";

/** Why a typed username cannot be used, or null. */
export function usernameProblem(typed: string): UsernameProblem | null {
  if (!USERNAME_INPUT_RE.test(typed)) return "bad";
  const base = typed.toLowerCase().replace(/_/g, "").replace(/[0-9]+$/, "");
  if (base.includes("tapturf") || base.includes("admin") || RESERVED.has(base)) return "reserved";
  return null;
}

/** Words of a display name in plain ASCII: accents dropped, anything else removed. */
function asciiWords(name: string): string[] {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Names to offer, best first, from the person's display name: the
 * database keeps the first free one (username_pick). Ends with numbered
 * ones so there is nearly always a free one. Names that are not Latin
 * script give nothing but the fallback "player" ones.
 */
export function usernameCandidates(name: string, random: () => number = Math.random): string[] {
  const words = asciiWords(name).map((w) => w.replace(/^[0-9]+/, "")).filter(Boolean);
  const out: string[] = [];
  const add = (c: string) => {
    const s = c.slice(0, 20).replace(/_+$/, "");
    if (!usernameProblem(s) && !out.includes(s)) out.push(s);
  };
  const [first = "", last = ""] = [words[0], words.length > 1 ? words[words.length - 1] : ""];
  if (first) {
    if (last) {
      add(first + last);
      add(`${first}_${last}`);
      add(first + last[0]);
      add(`${first}_${last[0]}`);
    }
    add(first);
  }
  const base = first ? (last ? `${first}_${last}` : first).slice(0, 15) : "player";
  const short = first ? first.slice(0, 15) : "player";
  for (let i = 0; i < 12; i++) {
    const n = 10 + Math.floor(random() * (i < 6 ? 90 : 9990));
    add(`${i % 2 ? short : base}${n}`);
  }
  return out.slice(0, 50);
}
