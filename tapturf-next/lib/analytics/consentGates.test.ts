import { test } from "node:test";
import assert from "node:assert/strict";
import { beaconBody, freshModules, installBrowser, type FakeBrowser } from "../consentTestkit";

/**
 * Every helper that tracks or stores a visit, with and without Accept on
 * the cookie banner (lib/consent.ts): Google Analytics (ga.ts), the visit
 * note (visitor.ts), the tools' guest tag (tools.ts), Call/WhatsApp taps
 * (contactClicks.ts). TapTurf's own anonymous counts run either way.
 */

type Mods = {
  consent: typeof import("../consent");
  ga: typeof import("./ga");
  visitor: typeof import("./visitor");
  tools: typeof import("./tools");
  contact: typeof import("./contactClicks");
  account: typeof import("../account/client");
};

const SUPA = "https://db.example.supabase.co";

function boot(o: Parameters<typeof installBrowser>[0] = {}): { b: FakeBrowser; m: Mods } {
  freshModules();
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  const b = installBrowser(o);
  /* eslint-disable @typescript-eslint/no-require-imports */
  const m: Mods = {
    consent: require("../consent"),
    ga: require("./ga"),
    visitor: require("./visitor"),
    tools: require("./tools"),
    contact: require("./contactClicks"),
    account: require("../account/client"),
  };
  /* eslint-enable @typescript-eslint/no-require-imports */
  return { b, m };
}

/** Runs fn with NODE_ENV=production (GA loads only there). */
function production<T>(fn: () => T): T {
  const was = process.env.NODE_ENV;
  (process.env as Record<string, string>).NODE_ENV = "production";
  try {
    return fn();
  } finally {
    if (was === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else (process.env as Record<string, string>).NODE_ENV = was;
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const rpcCalls = (b: FakeBrowser, name: string) => b.fetches.filter((f) => f.url === `${SUPA}/rest/v1/rpc/${name}`);

// ---------------------------------------------------------------------------
// Google Analytics

test("GA: no consent, nothing loads and nothing is sent, even in production", () => {
  const { b, m } = boot();
  try {
    production(() => {
      assert.equal(m.ga.startAnalytics(), false);
      m.ga.gaEvent("page_view", { page_path: "/" });
    });
    assert.equal(b.scripts.length, 0);
    assert.equal("gtag" in b.win, false);
    assert.equal("dataLayer" in b.win, false);
  } finally {
    b.uninstall();
  }
});

test("GA: never outside production, even with consent", () => {
  const { b, m } = boot();
  try {
    m.consent.setConsent("accepted");
    assert.equal(m.ga.startAnalytics(), false);
    assert.equal(b.scripts.length, 0);
  } finally {
    b.uninstall();
  }
});

test("GA: Accept loads gtag.js once, ads storage denied, no automatic page view; events then queue", () => {
  const { b, m } = boot();
  try {
    m.consent.setConsent("accepted");
    production(() => {
      assert.equal(m.ga.startAnalytics(), true);
      assert.equal(m.ga.startAnalytics(), true);
      m.ga.gaEvent("page_view", { page_path: "/pune" });
    });
    assert.deepEqual(b.scripts.map((s) => s.src), ["https://www.googletagmanager.com/gtag/js?id=G-KRDVP16TSM"]);
    const dl = (b.win.dataLayer as IArguments[]).map((a) => [...a]);
    assert.deepEqual(dl[0], ["consent", "default", { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "granted" }]);
    assert.equal(dl[1][0], "js");
    assert.deepEqual(dl[2], ["config", "G-KRDVP16TSM", { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false }]);
    assert.deepEqual(dl[3], ["event", "page_view", { page_path: "/pune" }]);
    assert.equal(dl.length, 4, "no second config or consent call");
    assert.equal(b.win["ga-disable-G-KRDVP16TSM"], false);
  } finally {
    b.uninstall();
  }
});

test("GA: Reject stops it on the page; a new Accept turns it back on without a second script", () => {
  const { b, m } = boot();
  try {
    m.consent.setConsent("accepted");
    production(() => m.ga.startAnalytics());
    m.consent.setConsent("rejected");
    assert.equal(b.win["ga-disable-G-KRDVP16TSM"], true);
    assert.equal("gtag" in b.win, false);
    const queued = (b.win.dataLayer as unknown[]).length;
    production(() => m.ga.gaEvent("turf_view", { turf_id: "t" }));
    assert.equal((b.win.dataLayer as unknown[]).length, queued, "nothing after the Reject");

    m.consent.setConsent("accepted");
    production(() => m.ga.gaEvent("turf_view", { turf_id: "t" }));
    const dl = (b.win.dataLayer as IArguments[]).map((a) => [...a]);
    assert.deepEqual(dl.slice(-2), [["consent", "update", { analytics_storage: "granted" }], ["event", "turf_view", { turf_id: "t" }]]);
    assert.equal(b.scripts.length, 1);
    assert.equal(b.win["ga-disable-G-KRDVP16TSM"], false);
  } finally {
    b.uninstall();
  }
});

// ---------------------------------------------------------------------------
// The visit note

const NOTE = ["tt_first_v1", "tt_visits_v1", "tt_interest_v1", "tt_funnel_v1"];

test("visit note: without consent nothing is written", () => {
  for (const gpc of [false, true]) {
    const { b, m } = boot({ href: "https://www.tapturf.in/pune?utm_source=insta", gpc });
    try {
      m.visitor.trackVisit();
      m.visitor.noteInterest({ city: "pune", sports: ["Football"], turf: true });
      m.visitor.step("turf_open");
      assert.deepEqual(b.local.keys(), [], `gpc=${gpc}`);
    } finally {
      b.uninstall();
    }
  }
});

test("visit note: after Accept it is kept, with the source of the page the visit landed on", () => {
  const { b, m } = boot({ href: "https://www.tapturf.in/pune?utm_source=insta&gclid=1" });
  try {
    // The visitor taps around, then accepts on another page.
    b.win.location = new URL("https://www.tapturf.in/turf/kick-off-arena-baner");
    m.consent.setConsent("accepted");
    m.visitor.trackVisit();
    m.visitor.noteInterest({ city: "pune", sports: ["Football"], turf: true });
    m.visitor.step("turf_open");
    const first = JSON.parse(b.local.getItem("tt_first_v1")!);
    assert.equal(first.landing, "/pune");
    assert.deepEqual(first.utm, { source: "insta" });
    assert.equal(first.ad_click, true);
    assert.equal(JSON.parse(b.local.getItem("tt_visits_v1")!).sessions, 1);
    assert.deepEqual(JSON.parse(b.local.getItem("tt_interest_v1")!), { city: { pune: 1 }, sport: { football: 1 }, turfs: 1 });
    assert.ok(JSON.parse(b.local.getItem("tt_funnel_v1")!).turf_open);
    m.consent.setConsent("rejected");
    for (const k of NOTE) assert.equal(b.local.getItem(k), null, `${k} deleted on Reject`);
  } finally {
    b.uninstall();
  }
});

test("sign-up: without consent no context is sent and nothing is kept", async () => {
  const { b, m } = boot();
  try {
    m.visitor.saveSignupContext("user-1", "phone");
    await tick();
    assert.equal(rpcCalls(b, "save_signup_context").length, 0);
    assert.deepEqual(b.local.keys(), []);
  } finally {
    b.uninstall();
  }
});

test("sign-up: with consent the summary is sent once", async () => {
  const { b, m } = boot();
  try {
    m.consent.setConsent("accepted");
    m.visitor.trackVisit();
    m.visitor.saveSignupContext("user-1", "google");
    await tick();
    const [call] = rpcCalls(b, "save_signup_context");
    assert.ok(call);
    const body = JSON.parse(String(call.init?.body));
    assert.equal(body.p_user_id, "user-1");
    assert.equal(body.p_ctx.method, "google");
    assert.ok(body.p_ctx.first, "the visit note goes with it");
  } finally {
    b.uninstall();
  }
});

test("turf views: counted for everyone, once per page; the session mark only with consent", async () => {
  const { b, m } = boot();
  try {
    m.visitor.logTurfView("t1");
    m.visitor.logTurfView("t1");
    assert.equal(rpcCalls(b, "log_turf_view").length, 1, "counted once without consent");
    assert.deepEqual(b.session.keys(), [], "and nothing kept");
    m.consent.setConsent("accepted");
    m.visitor.logTurfView("t2");
    assert.equal(rpcCalls(b, "log_turf_view").length, 2);
    assert.deepEqual(b.session.keys(), ["tt_viewed_t2"]);
    m.consent.setConsent("rejected");
    assert.deepEqual(b.session.keys(), [], "deleted on Reject");
  } finally {
    b.uninstall();
  }
});

test("turf views: never for headless browsers, consent or not", () => {
  const { b, m } = boot({ ua: "Mozilla/5.0 HeadlessChrome/130.0" });
  try {
    m.consent.setConsent("accepted");
    m.visitor.logTurfView("t1");
    assert.equal(rpcCalls(b, "log_turf_view").length, 0);
  } finally {
    b.uninstall();
  }
});

// ---------------------------------------------------------------------------
// Call / WhatsApp taps

test("contact taps: the anonymous count goes either way; the funnel step only with consent", () => {
  const { b, m } = boot();
  try {
    m.contact.logContactClick({ turfId: "t1", kind: "call", source: "turf_bar", signedIn: false });
    assert.equal(rpcCalls(b, "log_turf_contact_click").length, 1);
    assert.deepEqual(b.local.keys(), []);
    m.consent.setConsent("accepted");
    m.contact.logContactClick({ turfId: "t1", kind: "whatsapp", source: "turf_bar", signedIn: false });
    assert.equal(rpcCalls(b, "log_turf_contact_click").length, 2);
    assert.ok(JSON.parse(b.local.getItem("tt_funnel_v1")!).contact_click);
  } finally {
    b.uninstall();
  }
});

// ---------------------------------------------------------------------------
// The free tools' guest tag

test("tool uses: a guest's use is counted without a tag before Accept, and no tag is made", async () => {
  const { b, m } = boot();
  try {
    m.account.setSignInToken(null); // signed out
    m.tools.trackTool("tool_used", "toss");
    assert.equal(b.beacons.length, 1);
    assert.equal(b.beacons[0].url, "/api/tools/use");
    const body = await beaconBody(b.beacons[0]);
    assert.equal(body.tool, "toss");
    assert.equal(body.event, "started");
    assert.equal("device" in body, false, "no device tag");
    assert.equal(b.local.getItem("tt_tools_device"), null);
  } finally {
    b.uninstall();
  }
});

test("tool uses: after Accept the guest tag is made and sent; Reject deletes it and the next use has none", async () => {
  const { b, m } = boot();
  try {
    m.account.setSignInToken(null);
    m.consent.setConsent("accepted");
    m.tools.trackTool("tool_result_generated", "toss");
    const tag = b.local.getItem("tt_tools_device");
    assert.match(tag ?? "", /^[a-z0-9]{12}$/);
    assert.equal((await beaconBody(b.beacons[0])).device, tag);
    m.consent.setConsent("rejected");
    assert.equal(b.local.getItem("tt_tools_device"), null);
    m.tools.trackTool("tool_used", "toss");
    assert.equal("device" in (await beaconBody(b.beacons[1])), false);
    assert.equal(b.local.getItem("tt_tools_device"), null);
  } finally {
    b.uninstall();
  }
});

test("tool uses: a Reject stored by another tab stops the tag here before the next use", async () => {
  const { b, m } = boot();
  try {
    m.account.setSignInToken(null);
    m.consent.setConsent("accepted");
    b.jar.put("tt_consent", "rejected.v1"); // the other tab; this one is still on screen
    m.tools.trackTool("tool_used", "toss");
    assert.equal("device" in (await beaconBody(b.beacons[0])), false);
    assert.equal(b.local.getItem("tt_tools_device"), null);
    production(() => m.ga.gaEvent("tool_used", { tool: "toss" }));
    assert.equal(b.scripts.length, 0, "GA does not start either");
  } finally {
    b.uninstall();
  }
});

test("tool uses: GPC on is a Reject for the tag", async () => {
  const { b, m } = boot({ gpc: true });
  try {
    m.account.setSignInToken(null);
    m.tools.trackTool("tool_used", "team_generator");
    assert.equal("device" in (await beaconBody(b.beacons[0])), false);
    assert.equal(b.local.getItem("tt_tools_device"), null);
  } finally {
    b.uninstall();
  }
});

// ---------------------------------------------------------------------------
// One list of what Reject deletes

test("Reject's list is exactly the keys these modules keep with consent", () => {
  const { b, m } = boot();
  try {
    const kept = [...m.visitor.VISITOR_KEYS, m.tools.TOOL_DEVICE_KEY, "tapturf_city_detect_logged"].sort();
    assert.deepEqual([...m.consent.CONSENTED_LOCAL_KEYS].sort(), kept);
  } finally {
    b.uninstall();
  }
});
