import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AI_NOTE, WEB_NOTE, articleWelcome, blogCardView, isPlainClick, jumpToSection, sectionHref, visualShows, type JumpEnv } from "./blogUi";
import { ART_POLL_FOR_MS, ART_POLL_MS, ART_REQUEST_MS, artBroken, artReply, knownArt, loadArt, svgDataUrl } from "./artLoad";
import type { BlogAnswer, BlogVisual } from "../../lib/ask/blogTypes";

const answer = (over: Partial<BlogAnswer> = {}): BlogAnswer => ({
  slug: "box-cricket-rules",
  title: "Box cricket rules",
  readMinutes: 6,
  mode: "answer",
  kind: "ai",
  gist: "",
  points: [],
  visual: null,
  sections: [],
  sources: [],
  web: [],
  turfs: [],
  cta: { href: "/turfs", label: "Find a turf" },
  ...over,
});

describe("the answer card", () => {
  test("a greeting or off-topic reply has no button and no 'from the article' small print", () => {
    const v = blogCardView(answer());
    assert.equal(v.empty, true);
    assert.equal(v.cta, null);
    assert.equal(v.note, null);
  });

  test("an answer from the article keeps its button and small print", () => {
    const v = blogCardView(answer({ points: ["Six players a side."] }));
    assert.equal(v.empty, false);
    assert.deepEqual(v.cta, { href: "/turfs", label: "Find a turf" });
    assert.equal(v.note, AI_NOTE);
    // A section alone, or a visual alone, counts as the article too.
    assert.equal(blogCardView(answer({ sections: [{ n: 2, title: "Scoring", id: "scoring" }] })).note, AI_NOTE);
    assert.equal(blogCardView(answer({ visual: { kind: "steps", title: "How", steps: [{ title: "Bat", detail: "" }] } })).note, AI_NOTE);
  });

  test("a visual that wouldn't draw doesn't count", () => {
    const broken: BlogVisual = { kind: "bars", title: "Prices", unit: null, note: null, bars: [] };
    assert.equal(visualShows(broken), false);
    assert.equal(blogCardView(answer({ visual: broken })).empty, true);
    assert.equal(visualShows({ kind: "art", title: "Cage", alt: "A cage", token: "" }), false);
    assert.equal(visualShows({ kind: "art", title: "Cage", alt: "A cage", token: "t" }), true);
  });

  test("old summaries (no mode) still show their gist and small print", () => {
    const v = blogCardView({ ...answer({ gist: "Short version." }), mode: undefined });
    assert.equal(v.summary, true);
    assert.equal(v.note, AI_NOTE);
  });

  test("a web answer lists no part of the article as a source, even if some came back", () => {
    const v = blogCardView(
      answer({
        kind: "web",
        sections: [{ n: 3, title: "Rain rules", id: "rain-rules" }],
        sources: [{ label: "ICC", url: "https://www.icc-cricket.com/rules", host: "icc-cricket.com" }],
        turfs: [{ id: "t1", name: "Turf One", area: "Baner" }],
        web: [{ label: "Monsoon play", url: "https://example.com/monsoon", host: "example.com" }],
      }),
    );
    assert.deepEqual(v.sections, []);
    assert.deepEqual(v.cited, []);
    assert.deepEqual(v.turfs, []);
    assert.equal(v.pages.length, 1);
    assert.equal(v.note, WEB_NOTE);
  });

  test("an article answer keeps its sections, and drops links that aren't web pages", () => {
    const v = blogCardView(
      answer({
        sections: [{ n: 0, title: "Opening", id: null }],
        sources: [{ label: "Bad", url: "javascript:alert(1)", host: "" }],
      }),
    );
    assert.equal(v.sections.length, 1);
    assert.deepEqual(v.cited, []);
  });
});

describe("the welcome line", () => {
  test("promises a chart only when the article has numbers", () => {
    assert.match(articleWelcome(true), /chart its numbers/);
    assert.doesNotMatch(articleWelcome(false), /chart/);
    assert.equal(articleWelcome(false), "I can give you the short version or answer anything about this article.");
  });
});

describe("jumping to a section", () => {
  type Call = string;
  function fakePage(blockedFrames: number, ids: string[]) {
    const calls: Call[] = [];
    let frames: (() => void)[] = [];
    let blocked = blockedFrames;
    const env: JumpEnv = {
      frame: (f) => {
        frames.push(f);
      },
      canScroll: () => blocked <= 0,
      find: (id) => (ids.includes(id) ? { scrollIntoView: () => calls.push(`scroll:${id}`) } : null),
      toTop: () => calls.push("top"),
      setHash: (id) => calls.push(`hash:${id}`),
    };
    const runFrame = () => {
      const now = frames;
      frames = [];
      now.forEach((f) => f());
      // The page is held for the first `blockedFrames` frames.
      blocked--;
    };
    const runAll = () => {
      for (let i = 0; i < 50 && frames.length; i++) runFrame();
    };
    return { env, calls, runFrame, runAll };
  }

  test("scrolls every time, the same section twice included (the hash doesn't change)", () => {
    const page = fakePage(0, ["scoring"]);
    jumpToSection("scoring", page.env);
    page.runAll();
    jumpToSection("scoring", page.env);
    page.runAll();
    assert.deepEqual(page.calls, ["scroll:scoring", "hash:scoring", "scroll:scoring", "hash:scoring"]);
  });

  test("waits for the closed chat to give the page its scrolling back", () => {
    const page = fakePage(2, ["scoring"]);
    jumpToSection("scoring", page.env);
    page.runFrame();
    page.runFrame();
    assert.deepEqual(page.calls, []);
    page.runFrame();
    assert.deepEqual(page.calls, ["scroll:scoring", "hash:scoring"]);
  });

  test("scrolls anyway if the page stays held", () => {
    const page = fakePage(1000, ["scoring"]);
    jumpToSection("scoring", page.env);
    page.runAll();
    assert.deepEqual(page.calls, ["scroll:scoring", "hash:scoring"]);
  });

  test("the opening goes to the top and clears the hash", () => {
    const page = fakePage(0, []);
    jumpToSection(null, page.env);
    page.runAll();
    assert.deepEqual(page.calls, ["top", "hash:null"]);
  });

  test("section links, and which clicks the page handles", () => {
    assert.equal(sectionHref("/blog/x", { id: "scoring" }), "/blog/x#scoring");
    assert.equal(sectionHref("/blog/x", { id: null }), "/blog/x");
    const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
    assert.equal(isPlainClick(plain), true);
    assert.equal(isPlainClick({ ...plain, metaKey: true }), false);
    assert.equal(isPlainClick({ ...plain, ctrlKey: true }), false);
    assert.equal(isPlainClick({ ...plain, shiftKey: true }), false);
    assert.equal(isPlainClick({ ...plain, button: 1 }), false);
    assert.equal(isPlainClick({ ...plain, defaultPrevented: true }), false);
  });
});

describe("loading a drawing", () => {
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320"><text>₹500</text></svg>';
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  let n = 0;
  const token = () => `token-${++n}-${Math.random()}`;
  // Lets pending promises run (setImmediate isn't mocked).
  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  };

  beforeEach(() => mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 }));
  afterEach(() => mock.timers.reset());

  /** A fetch that answers from a list (the last one repeats) and records when it was asked. */
  function server(...replies: (() => Response)[]) {
    const at: number[] = [];
    const get = async () => {
      at.push(Date.now());
      return replies[Math.min(at.length - 1, replies.length - 1)]();
    };
    return { get, at };
  }

  /** A fetch that never answers, only rejects when aborted. */
  function hanging() {
    const at: number[] = [];
    const get = (_url: string, init: { signal: AbortSignal }) => {
      at.push(Date.now());
      return new Promise<Response>((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
    };
    return { get, at };
  }

  test("a drawing is kept for the visit: the next open doesn't ask", async () => {
    const t = token();
    const s = server(() => json(200, { svg: SVG }));
    const r = await loadArt(t, new AbortController().signal, s.get);
    assert.equal(r.kind, "ok");
    assert.equal(s.at.length, 1);
    const again = await loadArt(t, new AbortController().signal, s.get);
    assert.deepEqual(again, r);
    assert.equal(s.at.length, 1);
    assert.deepEqual(knownArt(t), { src: r.kind === "ok" ? r.src : "" });
  });

  test("the data URL carries the SVG's UTF-8 intact", () => {
    const url = svgDataUrl(SVG);
    assert.ok(url.startsWith("data:image/svg+xml;base64,"));
    assert.equal(Buffer.from(url.split(",")[1], "base64").toString("utf8"), SVG);
  });

  test("a refusal (502 no_art) is remembered: reopening the chat doesn't ask again", async () => {
    const t = token();
    const s = server(() => json(502, { error: "no_art" }));
    assert.equal((await loadArt(t, new AbortController().signal, s.get)).kind, "failed");
    assert.equal(knownArt(t), "failed");
    assert.equal((await loadArt(t, new AbortController().signal, s.get)).kind, "failed");
    assert.equal(s.at.length, 1);
  });

  test("while another request draws it (202), asks again every 4 s", async () => {
    const t = token();
    const s = server(
      () => json(202, { status: "drawing" }),
      () => json(202, { status: "drawing" }),
      () => json(200, { svg: SVG }),
    );
    const p = loadArt(t, new AbortController().signal, s.get);
    for (let i = 0; i < 3; i++) {
      await settle();
      mock.timers.tick(ART_POLL_MS);
    }
    assert.equal((await p).kind, "ok");
    assert.deepEqual(s.at, [0, ART_POLL_MS, 2 * ART_POLL_MS]);
  });

  test("stops asking about 60 s in, and doesn't remember that as a refusal", async () => {
    const t = token();
    const s = server(() => json(202, { status: "drawing" }));
    let done = false;
    const p = loadArt(t, new AbortController().signal, s.get).then((r) => {
      done = true;
      return r;
    });
    for (let i = 0; i < 40 && !done; i++) {
      await settle();
      mock.timers.tick(ART_POLL_MS);
    }
    assert.equal((await p).kind, "failed");
    assert.ok(s.at[s.at.length - 1] <= ART_POLL_FOR_MS);
    assert.ok(s.at.length >= 10 && s.at.length <= 16, `asked ${s.at.length} times`);
    assert.equal(knownArt(t), null);
  });

  test("one request gives up after 58 s, and the next open asks again", async () => {
    const t = token();
    const s = hanging();
    let done = false;
    const p = loadArt(t, new AbortController().signal, s.get).then((r) => {
      done = true;
      return r;
    });
    await settle();
    mock.timers.tick(ART_REQUEST_MS - 1);
    await settle();
    assert.equal(done, false, "still waiting just under the limit");
    mock.timers.tick(1);
    assert.equal((await p).kind, "failed");
    assert.equal(s.at.length, 1);
    assert.equal(knownArt(t), null);
    // The server finished and kept it meanwhile: the next open gets it.
    const later = server(() => json(200, { svg: SVG }));
    assert.equal((await loadArt(t, new AbortController().signal, later.get)).kind, "ok");
    assert.equal(later.at.length, 1);
  });

  test("closing the chat stops it at once and keeps nothing", async () => {
    const t = token();
    const s = hanging();
    const stop = new AbortController();
    const p = loadArt(t, stop.signal, s.get);
    await settle();
    stop.abort();
    assert.equal((await p).kind, "stopped");
    assert.equal(knownArt(t), null);
  });

  test("closing the chat between polls stops the polling", async () => {
    const t = token();
    const s = server(() => json(202, { status: "drawing" }));
    const stop = new AbortController();
    const p = loadArt(t, stop.signal, s.get);
    await settle();
    stop.abort();
    assert.equal((await p).kind, "stopped");
    mock.timers.tick(ART_POLL_FOR_MS);
    await settle();
    assert.equal(s.at.length, 1);
  });

  test("a rate limit or a dropped connection is not remembered", async () => {
    const t = token();
    assert.equal((await loadArt(t, new AbortController().signal, server(() => json(429, { error: "busy" })).get)).kind, "failed");
    assert.equal(knownArt(t), null);
    const offline = async () => {
      throw new TypeError("Failed to fetch");
    };
    assert.equal((await loadArt(t, new AbortController().signal, offline)).kind, "failed");
    assert.equal(knownArt(t), null);
  });

  test("a broken picture is not asked for again", async () => {
    const t = token();
    await loadArt(t, new AbortController().signal, server(() => json(200, { svg: SVG })).get);
    artBroken(t);
    assert.equal(knownArt(t), "failed");
  });

  test("what each answer means", () => {
    assert.deepEqual(artReply(200, { svg: ` ${SVG} ` }), { kind: "ok", svg: SVG });
    assert.deepEqual(artReply(200, { svg: "<html>" }), { kind: "no" });
    assert.deepEqual(artReply(202, { status: "drawing" }), { kind: "drawing" });
    assert.deepEqual(artReply(502, { error: "no_art" }), { kind: "no" });
    assert.deepEqual(artReply(400, { error: "bad_token" }), { kind: "no" });
    assert.deepEqual(artReply(503, { error: "not_configured" }), { kind: "no" });
    assert.deepEqual(artReply(429, { error: "busy" }), { kind: "later" });
    assert.deepEqual(artReply(500, null), { kind: "later" });
    assert.deepEqual(artReply(504, {}), { kind: "later" });
  });

  test("the chat waits longer than the server draws, and less than the route may run", () => {
    // The server's limits, read from its source so the two can't drift apart unnoticed.
    const root = process.cwd();
    const art = readFileSync(join(root, "lib/ai/blogArt.ts"), "utf8");
    const route = readFileSync(join(root, "app/api/ask/art/route.ts"), "utf8");
    const draw = Number(/const DRAW_TIMEOUT_MS = ([\d_]+);/.exec(art)?.[1].replace(/_/g, ""));
    const max = Number(/export const maxDuration = (\d+);/.exec(route)?.[1]) * 1000;
    assert.ok(draw > 0 && max > 0, "found the server's draw timeout and the route's maxDuration");
    assert.ok(ART_REQUEST_MS > draw, "a request outlasts the Opus call");
    assert.ok(ART_REQUEST_MS < max, "and ends before the route is cut off");
    assert.ok(ART_POLL_FOR_MS > draw, "polling outlasts a drawing already under way");
  });
});
