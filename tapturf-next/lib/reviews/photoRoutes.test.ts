import { test } from "node:test";
import assert from "node:assert/strict";
import { deleteReviewPhoto, getReviewPhotos, postReviewPhoto, sweepReviewPhotos, type JudgeAnswer, type ReviewPhotoDeps } from "./photoRoutes";
import { postFlag, postReview } from "./server";
import { dbProfile, installNet, net, phoneToken, req, settle, testEnv } from "../account/testkit";

// The review photo routes (lib/reviews/photoRoutes.ts), "Report this review"
// (postFlag) and the tip's rule at the review route, against the fake network
// (lib/account/testkit.ts). The check and the bucket are fakes. Made-up people only.

testEnv();
installNet();

const json = async (res: Response) => (await res.json()) as Record<string, unknown>;
const TURF = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";
const REVIEW = "cccccccc-cccc-4ccc-8ccc-000000000001";
const PHOTO = "dddddddd-dddd-4ddd-8ddd-000000000001";
const NAME = "0123456789abcdef01234567";

function fakes(o: { ready?: boolean; judge?: JudgeAnswer; upload?: (path: string) => boolean } = {}) {
  const seen = { judged: [] as { full: Uint8Array; thumb: Uint8Array; media: string }[], uploads: [] as { path: string; bytes: Uint8Array; media: string }[], removed: [] as string[][] };
  const deps: ReviewPhotoDeps = {
    judgeReady: () => o.ready ?? true,
    judge: async (full, thumb, media) => {
      seen.judged.push({ full, thumb, media });
      return o.judge ?? { ok: true, verdict: { usable: true, same: true, shows: "pitch_or_court", problem: "none", note: "A green turf under lights" } };
    },
    upload: async (path, bytes, media) => {
      seen.uploads.push({ path, bytes, media });
      return o.upload ? o.upload(path) : true;
    },
    remove: async (paths) => {
      seen.removed.push(paths);
      return paths;
    },
  };
  return { deps, seen };
}

function database() {
  net.reset();
  net.rpc.account_resolve = () => dbProfile({ id: "acc-1" });
  net.rpc.review_photo_ready = () => ({ r: "ok", paused: false, left: 7 });
  net.rpc.review_photo_start = () => ({ r: "ok", id: PHOTO, path: `${NAME}.webp`, thumb: `${NAME}_t.webp`, bucket: "review-photos", left: 6 });
  net.rpc.review_photo_finish = () => ({ r: "ok", photo: { id: PHOTO, path: `${NAME}.webp`, thumb: `${NAME}_t.webp`, w: 1600, h: 1200 } });
}
/** A PostgREST "no such function" (a database from before the file). */
const missing = () => Response.json({ code: "PGRST202", message: "Could not find the function", details: null, hint: null }, { status: 404 });

const le16 = (n: number) => [n & 255, (n >> 8) & 255];
const le32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
const be16 = (n: number) => [(n >> 8) & 255, n & 255];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** A WebP of this size (a VP8 frame header, then filler). */
function webp(w: number, h: number, size = 6000): Uint8Array {
  const frame = [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(w), ...le16(h), ...new Array(size).fill(7)];
  const body = [...ascii("VP8 "), ...le32(frame.length), ...frame];
  return Uint8Array.from([...ascii("RIFF"), ...le32(4 + body.length), ...ascii("WEBP"), ...body]);
}

/** A JPEG of this size with a camera's EXIF segment (where it was taken, made up). */
function jpegWithExif(w: number, h: number, size = 4000): Uint8Array {
  const exif = [0xff, 0xe1, ...be16(2 + 20), ...ascii("Exif\0\0lat 19.99 lng!")];
  const sof = [0xff, 0xc0, ...be16(17), 8, ...be16(h), ...be16(w), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  const sos = [0xff, 0xda, ...be16(12), 3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0, ...new Array(size).fill(9), 0xff, 0xd9];
  return Uint8Array.from([0xff, 0xd8, ...exif, ...sof, ...sos]);
}

let ipN = 300;
/** POST ?turf= with a form: the photo and its thumbnail. */
function upload(full: Uint8Array | null, thumb: Uint8Array | null, o: { turf?: string; token?: string | null } = {}): Request {
  ipN++;
  const form = new FormData();
  if (full) form.append("full", new Blob([Uint8Array.from(full)]), "photo");
  if (thumb) form.append("thumb", new Blob([Uint8Array.from(thumb)]), "thumb");
  const headers: Record<string, string> = { "x-forwarded-for": `10.8.${ipN >> 8}.${ipN & 255}` };
  if (o.token !== null) headers.authorization = `Bearer ${o.token ?? phoneToken()}`;
  return new Request(`http://localhost:3000/api/reviews/photos?turf=${o.turf ?? TURF}`, { method: "POST", headers, body: form });
}

/* ---------------- GET ---------------- */

test("photos GET: ready, uploads on, what's left today; before the migration ready false", async () => {
  database();
  const { deps } = fakes();
  const res = await getReviewPhotos(req("/api/reviews/photos", { token: phoneToken() }), deps);
  assert.deepEqual([res.status, await json(res)], [200, { ready: true, upload: true, left: 7 }]);
  assert.equal(net.calls("review_photo_ready")[0].args.p_user_id, "acc-1", "for the account the sign-in opens");
  assert.deepEqual(await json(await getReviewPhotos(req("/api/reviews/photos", { token: phoneToken() }), fakes({ ready: false }).deps)), { ready: true, upload: false, left: 7 }, "no judge: no uploads");
  net.rpc.review_photo_ready = missing;
  assert.deepEqual(await json(await getReviewPhotos(req("/api/reviews/photos", { token: phoneToken() }), deps)), { ready: false, upload: false, left: 0 }, "a database from before: nothing offered, nothing breaks");
  assert.equal((await getReviewPhotos(req("/api/reviews/photos"), deps)).status, 401, "signed out");
});

/* ---------------- POST ---------------- */

test("photos POST: checked, judged, both files uploaded, then ready; the account from the sign-in", async () => {
  database();
  const { deps, seen } = fakes();
  const res = await postReviewPhoto(upload(webp(1600, 1200), webp(360, 270, 800)), deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await json(res), { r: "ok", photo: { id: PHOTO, path: `${NAME}.webp`, thumb: `${NAME}_t.webp`, w: 1600, h: 1200 }, left: 6 });
  const [start] = net.calls("review_photo_start");
  assert.deepEqual([start.args.p_user_id, start.args.p_turf_id, start.args.p_ext, start.args.p_w, start.args.p_h], ["acc-1", TURF, "webp", 1600, 1200]);
  assert.equal(start.args.p_bytes, seen.uploads[0].bytes.length, "the size the server checked");
  assert.deepEqual(seen.uploads.map((u) => [u.path, u.media]), [[`${NAME}.webp`, "image/webp"], [`${NAME}_t.webp`, "image/webp"]]);
  assert.equal(seen.judged.length, 1, "judged once, the photo and its thumbnail together");
  assert.equal(net.calls("review_photo_finish").length, 1);
});

test("photos POST: the camera's details are taken out before the check and the upload", async () => {
  database();
  const { deps, seen } = fakes();
  net.rpc.review_photo_start = () => ({ r: "ok", id: PHOTO, path: `${NAME}.jpg`, thumb: `${NAME}_t.jpg`, bucket: "review-photos", left: 6 });
  const res = await postReviewPhoto(upload(jpegWithExif(1600, 1200), jpegWithExif(360, 270, 500)), deps);
  assert.equal(res.status, 200);
  for (const u of seen.uploads) assert.equal(Buffer.from(u.bytes).includes(Buffer.from("Exif")), false, `${u.path} has no EXIF`);
  assert.equal(Buffer.from(seen.judged[0].full).includes(Buffer.from("lat 19.99")), false, "nor what the check sees");
  assert.equal(net.calls("review_photo_start")[0].args.p_ext, "jpg");
});

test("photos POST: files that aren't a photo and its thumbnail never reach the database", async () => {
  database();
  const { deps } = fakes();
  const bad: [Uint8Array | null, Uint8Array | null, string, string][] = [
    [webp(1600, 1200), null, "not_photo", "no thumbnail"],
    [Uint8Array.from(ascii("<svg></svg>")), webp(360, 270, 800), "not_photo", "not an image"],
    [webp(1600, 1200), jpegWithExif(360, 270, 500), "not_photo", "two types"],
    [webp(2400, 1800), webp(360, 270, 800), "too_small", "over 1600"],
    [webp(1600, 1200), webp(360, 360, 800), "too_small", "a thumbnail of another shape"],
    [webp(1600, 1200, 1_100_000), webp(360, 270, 800), "too_big", "over 1 MB"],
    [webp(1600, 1200, 900), webp(360, 270, 2000), "too_big", "a thumbnail no smaller than the photo"],
  ];
  for (const [full, thumb, problem, why] of bad) {
    const res = await postReviewPhoto(upload(full, thumb), deps);
    assert.deepEqual([res.status, await json(res)], [400, { problem, error: "bad" }], why);
  }
  assert.equal((await postReviewPhoto(upload(webp(1600, 1200), webp(360, 270, 800), { turf: "x" }), deps)).status, 400, "a bad turf id");
  assert.equal((await postReviewPhoto(upload(webp(1600, 1200), webp(360, 270, 800), { token: null }), deps)).status, 401, "signed out");
  assert.equal(net.calls("review_photo_start").length, 0);
});

test("photos POST: what the check says, and a failed upload, end the ticket; nothing is kept", async () => {
  const cases: [JudgeAnswer | "upload", number, Record<string, unknown>, string][] = [
    [{ ok: false, problem: "spam", verdict: { usable: false, problem: "spam" } }, 422, { problem: "spam", error: "refused" }, "refused"],
    [{ unreadable: true }, 400, { problem: "not_photo", error: "bad" }, "refused"],
    [{ down: true }, 503, { error: "unchecked" }, "unchecked"],
    ["upload", 503, { error: "unavailable" }, "expired"],
  ];
  for (const [answer, status, body, outcome] of cases) {
    database();
    const { deps, seen } = fakes(answer === "upload" ? { upload: (p) => !p.includes("_t.") } : { judge: answer });
    const res = await postReviewPhoto(upload(webp(1600, 1200), webp(360, 270, 800)), deps);
    assert.deepEqual([res.status, await json(res)], [status, body], outcome);
    assert.equal(net.calls("review_photo_end")[0].args.p_outcome, outcome);
    assert.equal(net.calls("review_photo_finish").length, 0);
    if (answer !== "upload") assert.equal(seen.uploads.length, 0, "a photo the check turns down is never uploaded");
  }
});

test("photos POST: the database's refusals, and a database from before", async () => {
  const cases: [unknown, number, Record<string, unknown>][] = [
    [{ r: "limit" }, 429, { error: "limit" }],
    [{ r: "paused" }, 503, { error: "unchecked" }],
    [{ r: "own_turf" }, 409, { reason: "own_turf", error: "not_allowed" }],
    [{ r: "gone" }, 400, { reason: "gone", error: "bad" }],
    [{ r: "bad" }, 400, { error: "bad" }],
  ];
  for (const [answer, status, body] of cases) {
    database();
    net.rpc.review_photo_start = () => answer;
    const res = await postReviewPhoto(upload(webp(1600, 1200), webp(360, 270, 800)), fakes().deps);
    assert.deepEqual([res.status, await json(res)], [status, body], JSON.stringify(answer));
  }
  database();
  net.rpc.review_photo_start = missing;
  const before = await postReviewPhoto(upload(webp(1600, 1200), webp(360, 270, 800)), fakes().deps);
  assert.deepEqual([before.status, await json(before)], [503, { reason: "not_ready", error: "unavailable" }]);
  database();
  assert.equal((await postReviewPhoto(upload(webp(1600, 1200), webp(360, 270, 800)), fakes({ ready: false }).deps)).status, 503, "no judge: nothing checked, nothing kept");
  assert.equal(net.calls("review_photo_start").length, 0);
});

/* ---------------- DELETE and the sweep ---------------- */

test("photos DELETE: a photo not posted yet goes; its files after the reply", async () => {
  database();
  const { deps, seen } = fakes();
  net.rpc.review_photo_discard = () => ({ r: "ok", files: [{ id: PHOTO, paths: [`${NAME}.webp`, `${NAME}_t.webp`] }] });
  const res = await deleteReviewPhoto(req(`/api/reviews/photos?id=${PHOTO}`, { method: "DELETE", token: phoneToken() }), deps);
  assert.deepEqual([res.status, await json(res)], [200, { r: "ok" }]);
  assert.deepEqual(net.calls("review_photo_discard")[0].args, { p_key: "test-account-key", p_user_id: "acc-1", p_id: PHOTO });
  await settle();
  assert.deepEqual(seen.removed, [[`${NAME}.webp`, `${NAME}_t.webp`]]);
  assert.deepEqual(net.calls("review_photo_files_gone")[0].args.p_ids, [PHOTO]);
  net.rpc.review_photo_discard = () => ({ r: "bad" });
  assert.equal((await deleteReviewPhoto(req(`/api/reviews/photos?id=${PHOTO}`, { method: "DELETE", token: phoneToken() }), deps)).status, 400, "one on a posted report, or someone else's");
  assert.equal((await deleteReviewPhoto(req(`/api/reviews/photos?id=x`, { method: "DELETE", token: phoneToken() }), deps)).status, 400);
});

test("photos sweep: files nothing shows are taken away and marked gone; only those fully gone", async () => {
  database();
  net.rpc.review_photo_sweep_list = () => ({ r: "ok", files: [{ id: "p1", paths: [`${NAME}.webp`, `${NAME}_t.webp`] }, { id: "p2", paths: ["fedcba9876543210fedcba98.jpg", "fedcba9876543210fedcba98_t.jpg"] }, { id: "p3", paths: ["../x"] }] });
  const removed: string[][] = [];
  const r = await sweepReviewPhotos({ remove: async (paths) => (removed.push(paths), paths.filter((p) => !p.startsWith("fedcba"))) });
  assert.deepEqual(r, { ok: true, listed: 2, removed: 1 });
  assert.deepEqual(removed[0], [`${NAME}.webp`, `${NAME}_t.webp`, "fedcba9876543210fedcba98.jpg", "fedcba9876543210fedcba98_t.jpg"], "never a path that isn't one of ours");
  assert.deepEqual(net.calls("review_photo_files_gone")[0].args.p_ids, ["p1"], "a photo one of whose files stayed is tried again");
  net.rpc.review_photo_sweep_list = missing;
  assert.deepEqual(await sweepReviewPhotos({ remove: async (p) => p }), { ok: true, listed: 0, removed: 0 }, "before the migration: nothing to do");
});

/* ---------------- the review route: the tip's rule and the photos ---------------- */

test("post: a tip with a handle or a number never reaches review_save; the answer is the database's", async () => {
  database();
  for (const [body, field] of [[{ comment: "DM @kingsturf on Instagram" }, "comment"], [{ comment: "Book at kingsturf.com" }, "comment"], [{ note: { body: "Call 98765 43210", show_name: true } }, "note"]] as const) {
    const res = await postReview(req("/api/reviews", { method: "POST", token: phoneToken(), body: { turf_id: TURF, rating: 4, ...body } }));
    assert.deepEqual([res.status, await json(res)], [400, { reason: "contact_info", field, error: "bad" }], JSON.stringify(body));
  }
  assert.equal(net.calls("review_save").length, 0);
  net.rpc.review_save = () => ({ r: "ok", created: true, review: { id: REVIEW, status: "live" }, note: null, after: { tapturf_n: 1, aspects: {} }, price_saved: false });
  assert.equal((await postReview(req("/api/reviews", { method: "POST", token: phoneToken(), body: { turf_id: TURF, rating: 4, comment: "Booked @7pm", photos: [PHOTO] } }))).status, 200);
  assert.deepEqual((net.calls("review_save")[0].args.p_report as Record<string, unknown>).photos, [PHOTO], "the photos go on to review_save");
});

/* ---------------- Report this review ---------------- */

test("flag: the account from the sign-in; the reason and line checked; the database's answers", async () => {
  database();
  net.rpc.review_flag = () => ({ r: "ok", already: false });
  const res = await postFlag(req("/api/reviews/flag", { method: "POST", token: phoneToken(), body: { review_id: REVIEW, reason: "abusive", detail: "  Rude  ", user_id: "x" } }));
  assert.deepEqual([res.status, await json(res)], [200, { r: "ok", already: false }]);
  assert.deepEqual(net.calls("review_flag")[0].args, { p_key: "test-account-key", p_user_id: "acc-1", p_review_id: REVIEW, p_reason: "abusive", p_detail: "Rude" });
  for (const body of [{ review_id: "x", reason: "spam" }, { review_id: REVIEW, reason: "rude" }, { review_id: REVIEW, reason: "other", detail: "x".repeat(301) }]) {
    assert.equal((await postFlag(req("/api/reviews/flag", { method: "POST", token: phoneToken(), body }))).status, 400, JSON.stringify(body).slice(0, 60));
  }
  assert.equal(net.calls("review_flag").length, 1);
  const cases: [unknown, number, Record<string, unknown>][] = [
    [{ r: "ok", already: true }, 200, { r: "ok", already: true }],
    [{ r: "own" }, 409, { reason: "own", error: "not_allowed" }],
    [{ r: "google" }, 409, { reason: "google", error: "not_allowed" }],
    [{ r: "gone" }, 400, { reason: "gone", error: "bad" }],
    [{ r: "limit" }, 429, { error: "limit" }],
  ];
  for (const [answer, status, body] of cases) {
    net.rpc.review_flag = () => answer;
    const r = await postFlag(req("/api/reviews/flag", { method: "POST", token: phoneToken(), body: { review_id: REVIEW, reason: "spam" } }));
    assert.deepEqual([r.status, await json(r)], [status, body], JSON.stringify(answer));
  }
  net.rpc.review_flag = missing;
  const before = await postFlag(req("/api/reviews/flag", { method: "POST", token: phoneToken(), body: { review_id: REVIEW, reason: "spam" } }));
  assert.deepEqual([before.status, await json(before)], [503, { reason: "not_ready", error: "unavailable" }], "a database from before the file");
  assert.equal((await postFlag(req("/api/reviews/flag", { method: "POST", body: { review_id: REVIEW, reason: "spam" } }))).status, 401, "signed out: log in");
});
