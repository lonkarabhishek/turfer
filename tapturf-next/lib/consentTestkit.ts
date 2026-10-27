/**
 * A small fake browser for the consent tests (lib/consent.test.ts,
 * lib/analytics/consentGates.test.ts): a cookie jar that follows Domain,
 * Max-Age and Expires like a browser's, both storages, navigator with
 * Global Privacy Control, sendBeacon and fetch that record what was sent,
 * and document.head for the GA script. Test-only.
 */

import { sep } from "node:path";

export class MemoryStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  keys() {
    return [...this.m.keys()];
  }
}

type Jarred = { name: string; value: string; domain: string | null };

/** document.cookie as a browser keeps it: one cookie per name and domain (host-only is its own). */
export class CookieJar {
  private jar = new Map<string, Jarred>();
  constructor(private host: string) {}
  get header(): string {
    return [...this.jar.values()].map((c) => `${c.name}=${c.value}`).join("; ");
  }
  set(text: string): void {
    const [pair, ...attrs] = text.split(";");
    const eq = pair.indexOf("=");
    if (eq < 1) return;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    let domain: string | null = null;
    let expired = false;
    for (const a of attrs) {
      const [k, ...v] = a.split("=");
      const key = k.trim().toLowerCase();
      const val = v.join("=").trim();
      if (key === "domain") domain = val.replace(/^\./, "").toLowerCase();
      if (key === "max-age" && Number(val) <= 0) expired = true;
      if (key === "expires" && Date.parse(val) < Date.now()) expired = true;
    }
    // A browser ignores a Domain the host is not in, and a bare top-level one.
    if (domain !== null && (!domain.includes(".") || (this.host !== domain && !this.host.endsWith(`.${domain}`)))) return;
    const id = `${name}|${domain ?? ""}`;
    if (expired) this.jar.delete(id);
    else this.jar.set(id, { name, value, domain });
  }
  /** Seed a cookie as another script (GA) would have set it. */
  put(name: string, value: string, domain: string | null = null): void {
    this.jar.set(`${name}|${domain ?? ""}`, { name, value, domain });
  }
  names(): string[] {
    return [...this.jar.values()].map((c) => c.name);
  }
}

type Listener = (e: { type: string }) => void;

export type FakeBrowser = {
  jar: CookieJar;
  local: MemoryStorage;
  session: MemoryStorage;
  beacons: { url: string; body: Blob }[];
  fetches: { url: string; init?: RequestInit }[];
  scripts: { src: string }[];
  win: Record<string, unknown> & { location: URL };
  nav: Record<string, unknown>;
  fire: (type: string) => void;
  uninstall: () => void;
};

const KEYS = ["window", "document", "navigator", "localStorage", "sessionStorage", "fetch"] as const;

/** Installs the fake on globalThis. Call uninstall() after the test. */
export function installBrowser(o: { href?: string; gpc?: boolean; ua?: string } = {}): FakeBrowser {
  const location = new URL(o.href ?? "https://www.tapturf.in/");
  const jar = new CookieJar(location.hostname);
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  const beacons: FakeBrowser["beacons"] = [];
  const fetches: FakeBrowser["fetches"] = [];
  const scripts: FakeBrowser["scripts"] = [];
  const listeners = new Map<string, Set<Listener>>();
  const on = (t: string, fn: Listener) => {
    if (!listeners.has(t)) listeners.set(t, new Set());
    listeners.get(t)!.add(fn);
  };
  const off = (t: string, fn: Listener) => listeners.get(t)?.delete(fn);
  const fire = (type: string) => {
    for (const fn of [...(listeners.get(type) ?? [])]) fn({ type });
  };
  const doc = {
    get cookie() {
      return jar.header;
    },
    set cookie(v: string) {
      jar.set(v);
    },
    visibilityState: "visible",
    title: "A turf page",
    referrer: "",
    addEventListener: on,
    removeEventListener: off,
    head: {
      appendChild(el: { src: string }) {
        scripts.push(el);
        return el;
      },
    },
    createElement: () => ({ async: false, src: "" }),
  };
  const nav: Record<string, unknown> = {
    userAgent: o.ua ?? "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
    webdriver: false,
    language: "en-IN",
    onLine: true,
    sendBeacon(url: string, body: Blob) {
      beacons.push({ url, body });
      return true;
    },
  };
  if (o.gpc !== undefined) nav.globalPrivacyControl = o.gpc;
  const win: FakeBrowser["win"] = {
    location,
    addEventListener: on,
    removeEventListener: off,
    matchMedia: () => ({ matches: false }),
    screen: { width: 390, height: 844 },
    innerWidth: 390,
  };
  const fakeFetch = (url: string, init?: RequestInit) => {
    fetches.push({ url: String(url), init });
    return Promise.resolve(new Response(null, { status: 204 }));
  };
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const k of KEYS) saved.set(k, Object.getOwnPropertyDescriptor(globalThis, k));
  const define = (k: string, value: unknown) => Object.defineProperty(globalThis, k, { value, configurable: true, writable: true });
  define("window", win);
  define("document", doc);
  define("navigator", nav);
  define("localStorage", local);
  define("sessionStorage", session);
  define("fetch", fakeFetch);
  return {
    jar,
    local,
    session,
    beacons,
    fetches,
    scripts,
    win,
    nav,
    fire,
    uninstall() {
      for (const k of KEYS) {
        const d = saved.get(k);
        if (d) Object.defineProperty(globalThis, k, d);
        else Reflect.deleteProperty(globalThis, k);
      }
    },
  };
}

/**
 * Forget every compiled app module under this test build, so the next
 * require starts with fresh module state (the consent store, GA's
 * "loaded", the view counter's set). React and other packages stay.
 */
export function freshModules(): void {
  for (const k of Object.keys(require.cache)) {
    if (k.includes(`${sep}.test-out${sep}`) && !k.endsWith(".test.js") && !k.endsWith("consentTestkit.js")) delete require.cache[k];
  }
}

/** A beacon's JSON body. */
export const beaconBody = async (b: { body: Blob }): Promise<Record<string, unknown>> => JSON.parse(await b.body.text());
