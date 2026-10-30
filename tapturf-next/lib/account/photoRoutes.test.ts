import { test } from "node:test";
import assert from "node:assert/strict";
import { deletePhoto, getPhoto, patchPhoto, postPhoto, type JudgeAnswer, type PhotoDeps } from "./photoRoutes";
import { dbProfile, googleSession, installNet, net, phoneToken, req, settle, testEnv } from "./testkit";

testEnv();
installNet();

const json = async (res: Response) => (await res.json()) as Record<string, unknown>;
const BASE = "https://hwfsbpzercuoshodmnuf.supabase.co/storage/v1/object/public/avatars/";
const PATH = "0123456789abcdef01234567.webp";

/** The check and the bucket, faked; what they were asked is kept. */
function fakes(o: { ready?: boolean; judge?: JudgeAnswer; upload?: boolean } = {}) {
  const seen = { judged: [] as Uint8Array[], uploads: [] as { path: string; bytes: Uint8Array; media: string }[], removed: [] as string[][] };
  const deps: PhotoDeps = {
    judgeReady: () => o.ready ?? true,
    judge: async (bytes) => {
      seen.judged.push(bytes);
      return o.judge ?? { ok: true, verdict: { usable: true, shows: "person", problem: "none", note: "A smiling player" } };
    },
    upload: async (path, bytes, media) => {
      seen.uploads.push({ path, bytes, media });
      return o.upload ?? true;
    },
    remove: async (paths) => {
      seen.removed.push(paths);
      return paths;
    },
  };
  return { deps, seen };
}

/** The account answers and photo functions of a database that has photos. */
function database(o: { photo?: string | null } = {}) {
  net.reset();
  net.rpc.account_resolve = () => dbProfile({ id: "acc-1", profile_image_url: o.photo ?? null });
  net.rpc.account_photo_ready = () => ({ r: "ok", paused: false });
  net.rpc.account_photo_start = () => ({ r: "ok", id: "ph-2", path: PATH, bucket: "avatars" });
  net.rpc.account_photo_finish = () => ({ ...dbProfile({ id: "acc-1", profile_image_url: BASE + PATH }), files: [{ id: "ph-1", path: "fedcba9876543210fedcba98.webp" }] });
  net.rpc.account_photo_set = (a) => ({
    ...dbProfile({ id: "acc-1", profile_image_url: a.p_kind === "preset" ? `/avatars/${a.p_value}.svg` : a.p_kind === "google" ? a.p_value : null }),
    files: [],
  });
}

const le16 = (n: number) => [n & 255, (n >> 8) & 255];
const le32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
const be16 = (n: number) => [(n >> 8) & 255, n & 255];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** A WebP of this size (a VP8 frame header, then filler). */
function webp(side: number, size = 6000): Uint8Array {
  const frame = [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(side), ...le16(side), ...new Array(size).fill(7)];
  const body = [...ascii("VP8 "), ...le32(frame.length), ...frame];
  return Uint8Array.from([...ascii("RIFF"), ...le32(4 + body.length), ...ascii("WEBP"), ...body]);
}

/** A JPEG with a camera's EXIF segment. */
function jpegWithExif(side: number): Uint8Array {
  const exif = [0xff, 0xe1, ...be16(2 + 20), ...ascii("Exif\0\0lat 19.99 lng!")];
  const sof = [0xff, 0xc0, ...be16(17), 8, ...be16(side), ...be16(side), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  const sos = [0xff, 0xda, ...be16(12), 3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0, ...new Array(4000).fill(9), 0xff, 0xd9];
  return Uint8Array.from([0xff, 0xd8, ...exif, ...sof, ...sos]);
}

let ipN = 200;
/** A request carrying the image itself. */
function upload(bytes: Uint8Array, token = phoneToken(), type = "image/webp"): Request {
  ipN++;
  return new Request("http://localhost:3000/api/account/photo", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": type, "x-forwarded-for": `10.9.${ipN >> 8}.${ipN & 255}` },
    body: new Blob([Uint8Array.from(bytes)]),
  });
}

/* ------------------------------------------------------------------ */
/* GET                                                                 */
/* ------------------------------------------------------------------ */

test("photo GET: what this sign-in can choose", async () => {
  database();
  const { deps } = fakes();
  const phone = await getPhoto(req("/api/account/photo", { token: phoneToken() }), deps);
  assert.equal(phone.status, 200);
  assert.deepEqual(await json(phone), { ready: true, upload: true, google: null });
  assert.equal(phone.headers.get("cache-control"), "private, no-store");

  // A Google sign-in is offered its own Google photo, at the size we keep.
  const g = await getPhoto(req("/api/account/photo", { token: googleSession({ user: { user_metadata: { full_name: "Shaik", avatar_url: "https://lh3.googleusercontent.com/a/ACg8oc-x=s96-c" } } }) }), deps);
  assert.deepEqual(await json(g), { ready: true, upload: true, google: "https://lh3.googleusercontent.com/a/ACg8oc-x=s256-c" });

  // Uploads paused, or no judge: the avatars still work.
  net.rpc.account_photo_ready = () => ({ r: "ok", paused: true });
  assert.deepEqual(await json(await getPhoto(req("/api/account/photo", { token: phoneToken() }), deps)), { ready: true, upload: false, google: null });
  net.rpc.account_photo_ready = () => ({ r: "ok", paused: false });
  assert.deepEqual(await json(await getPhoto(req("/api/account/photo", { token: phoneToken() }), fakes({ ready: false }).deps)), { ready: true, upload: false, google: null });
});

test("photo GET: a database from before photos says so, quietly", async () => {
  database();
  net.rpc.account_photo_ready = () => Response.json({ code: "PGRST202", message: "Could not find the function public.account_photo_ready(p_key)" }, { status: 404 });
  const res = await getPhoto(req("/api/account/photo", { token: phoneToken() }), fakes().deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await json(res), { ready: false, upload: false, google: null });
  // Down is not "not there".
  net.rpc.account_photo_ready = () => Response.json({ message: "timeout" }, { status: 500 });
  assert.equal((await getPhoto(req("/api/account/photo", { token: phoneToken() }), fakes().deps)).status, 503);
});

test("photo routes: a sign-in or nothing", async () => {
  database();
  const { deps, seen } = fakes();
  for (const res of [
    await getPhoto(req("/api/account/photo"), deps),
    await postPhoto(req("/api/account/photo", { method: "POST" }), deps),
    await patchPhoto(req("/api/account/photo", { method: "PATCH", body: { preset: "football" } }), deps),
    await deletePhoto(req("/api/account/photo", { method: "DELETE", token: "not-a-token" }), deps),
  ]) {
    assert.equal(res.status, 401);
    assert.deepEqual(await json(res), { error: "sign_in" });
  }
  assert.equal(net.rpcCalls.length, 0);
  assert.equal(seen.judged.length + seen.uploads.length, 0);
});

/* ------------------------------------------------------------------ */
/* Upload                                                              */
/* ------------------------------------------------------------------ */

test("photo POST: checked, stored at the ticket's path, shown; the old file removed after", async () => {
  database();
  const { deps, seen } = fakes();
  const file = webp(512);
  const res = await postPhoto(upload(file), deps);
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.equal((body.profile as { profile_image_url: string }).profile_image_url, BASE + PATH);
  // The ticket is for this account, this type and this many bytes.
  assert.deepEqual(net.calls("account_photo_start")[0].args, { p_key: "test-account-key", p_user_id: "acc-1", p_ext: "webp", p_bytes: file.length });
  // Judged, then uploaded, the same bytes.
  assert.equal(seen.judged.length, 1);
  assert.deepEqual(seen.uploads.map((u) => [u.path, u.media, u.bytes.length]), [[PATH, "image/webp", file.length]]);
  assert.deepEqual(net.calls("account_photo_finish")[0].args.p_id, "ph-2");
  assert.equal((net.calls("account_photo_finish")[0].args.p_verdict as { usable: boolean }).usable, true, "the check's answer is kept");
  await settle();
  assert.deepEqual(seen.removed, [["fedcba9876543210fedcba98.webp"]]);
  assert.deepEqual(net.calls("account_photo_files_gone")[0].args.p_ids, ["ph-1"]);
});

test("photo POST: a camera's EXIF never reaches the bucket", async () => {
  database();
  net.rpc.account_photo_start = () => ({ r: "ok", id: "ph-3", path: "0123456789abcdef01234567.jpg" });
  const { deps, seen } = fakes();
  const file = jpegWithExif(480);
  assert.equal((await postPhoto(upload(file, phoneToken(), "image/jpeg"), deps)).status, 200);
  const sent = seen.uploads[0];
  assert.equal(sent.media, "image/jpeg");
  assert.equal(sent.bytes.length, file.length - 24);
  assert.equal(Buffer.from(sent.bytes).includes("Exif"), false);
  assert.equal(net.calls("account_photo_start")[0].args.p_bytes, sent.bytes.length, "the ticket is for what is stored");
  assert.equal(net.calls("account_photo_start")[0].args.p_ext, "jpg");
  await settle();
});

test("photo POST: not a photo we keep, before the account or the check is asked", async () => {
  for (const [file, problem] of [
    [Uint8Array.from(ascii("<svg onload=alert(1)></svg>")), "not_photo"],
    [Uint8Array.from([0x89, ...ascii("PNG"), 13, 10, 26, 10, ...new Array(3000).fill(1)]), "not_photo"],
    [webp(512, 600_000), "too_big"],
    [webp(64), "too_small"],
    [webp(4096), "too_small"],
  ] as const) {
    database();
    const { deps, seen } = fakes();
    const res = await postPhoto(upload(file), deps);
    assert.equal(res.status, 400, problem);
    assert.deepEqual(await json(res), { problem, error: "bad" });
    assert.equal(net.rpcCalls.length, 0);
    assert.equal(seen.judged.length, 0);
  }
});

test("photo POST: the check says no: nothing stored, and why", async () => {
  database();
  const { deps, seen } = fakes({ judge: { ok: false, problem: "sexual", verdict: { usable: false, problem: "sexual" } } });
  const res = await postPhoto(upload(webp(512)), deps);
  assert.equal(res.status, 422);
  assert.deepEqual(await json(res), { problem: "sexual", error: "refused" });
  assert.equal(seen.uploads.length, 0, "never uploaded");
  assert.deepEqual(net.calls("account_photo_drop")[0].args, { p_key: "test-account-key", p_user_id: "acc-1", p_id: "ph-2", p_outcome: "refused", p_verdict: { usable: false, problem: "sexual" } });
  assert.equal(net.calls("account_photo_finish").length, 0);
});

test("photo POST: no check, no photo", async () => {
  database();
  let f = fakes({ judge: { down: true } });
  let res = await postPhoto(upload(webp(512)), f.deps);
  assert.equal(res.status, 503);
  assert.deepEqual(await json(res), { error: "unchecked" });
  assert.equal(f.seen.uploads.length, 0);
  assert.equal(net.calls("account_photo_drop")[0].args.p_outcome, "unchecked");

  database();
  f = fakes({ ready: false });
  res = await postPhoto(upload(webp(512)), f.deps);
  assert.deepEqual([res.status, await json(res)], [503, { error: "unchecked" }]);
  assert.equal(net.calls("account_photo_start").length, 0, "no ticket");

  database();
  f = fakes({ judge: { unreadable: true } });
  res = await postPhoto(upload(webp(512)), f.deps);
  assert.deepEqual([res.status, await json(res)], [400, { problem: "not_photo", error: "bad" }]);
  assert.equal(net.calls("account_photo_drop")[0].args.p_outcome, "refused");
});

test("photo POST: ten a day; paused; a failed upload", async () => {
  database();
  net.rpc.account_photo_start = () => ({ r: "limit" });
  let f = fakes();
  let res = await postPhoto(upload(webp(512)), f.deps);
  assert.deepEqual([res.status, await json(res)], [429, { error: "limit" }]);
  assert.equal(f.seen.judged.length, 0, "not judged");

  database();
  net.rpc.account_photo_start = () => ({ r: "paused" });
  res = await postPhoto(upload(webp(512)), fakes().deps);
  assert.deepEqual([res.status, await json(res)], [503, { error: "unchecked" }]);

  database();
  f = fakes({ upload: false });
  res = await postPhoto(upload(webp(512)), f.deps);
  assert.deepEqual([res.status, await json(res)], [503, { error: "unavailable" }]);
  assert.equal(net.calls("account_photo_drop")[0].args.p_outcome, "expired", "its file, if any, is removed later");
  assert.equal(net.calls("account_photo_finish").length, 0);

  database();
  net.rpc.account_photo_finish = () => ({ r: "missing" });
  res = await postPhoto(upload(webp(512)), fakes().deps);
  assert.deepEqual([res.status, await json(res)], [503, { error: "unavailable" }]);

  database();
  net.rpc.account_resolve = () => ({ r: "new" });
  res = await postPhoto(upload(webp(512)), fakes().deps);
  assert.deepEqual([res.status, await json(res)], [404, { error: "new" }]);
});

/* ------------------------------------------------------------------ */
/* Avatars, Google, Remove                                             */
/* ------------------------------------------------------------------ */

test("photo PATCH: an avatar from the list", async () => {
  database();
  const { deps } = fakes();
  const res = await patchPhoto(req("/api/account/photo", { method: "PATCH", token: phoneToken(), body: { preset: "cricket-ball" } }), deps);
  assert.equal(res.status, 200);
  assert.equal(((await json(res)).profile as { profile_image_url: string }).profile_image_url, "/avatars/cricket-ball.svg");
  assert.deepEqual(net.calls("account_photo_set")[0].args, { p_key: "test-account-key", p_user_id: "acc-1", p_kind: "preset", p_value: "cricket-ball" });
  for (const body of [{ preset: "dragon" }, { preset: "../x" }, { preset: 3 }, {}, { preset: "football", google: true }, { google: "yes" }]) {
    database();
    const r = await patchPhoto(req("/api/account/photo", { method: "PATCH", token: phoneToken(), body }), deps);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(net.calls("account_photo_set").length, 0);
  }
});

test("photo PATCH: the Google photo is the verified sign-in's own, never one sent", async () => {
  database();
  const { deps } = fakes();
  const token = googleSession({ user: { user_metadata: { full_name: "Shaik", avatar_url: "https://lh3.googleusercontent.com/a/ACg8oc-me=s96-c" } } });
  const res = await patchPhoto(req("/api/account/photo", { method: "PATCH", token, body: { google: true, url: "https://evil.example/x.png" } }), deps);
  assert.equal(res.status, 200);
  assert.deepEqual(net.calls("account_photo_set")[0].args, {
    p_key: "test-account-key",
    p_user_id: "acc-1",
    p_kind: "google",
    p_value: "https://lh3.googleusercontent.com/a/ACg8oc-me=s256-c",
  });
  // A phone sign-in has no Google photo to give; nor a Google account without one.
  database();
  let r = await patchPhoto(req("/api/account/photo", { method: "PATCH", token: phoneToken(), body: { google: true } }), deps);
  assert.deepEqual([r.status, await json(r)], [409, { error: "not_allowed" }]);
  r = await patchPhoto(req("/api/account/photo", { method: "PATCH", token: googleSession({ user: { user_metadata: { full_name: "Shaik" } } }), body: { google: true } }), deps);
  assert.deepEqual([r.status, await json(r)], [409, { error: "not_allowed" }]);
  assert.equal(net.calls("account_photo_set").length, 0);
});

test("photo DELETE: back to initials, the old file removed after the reply", async () => {
  database();
  net.rpc.account_photo_set = () => ({ ...dbProfile({ id: "acc-1", profile_image_url: null }), files: [{ id: "ph-1", path: "fedcba9876543210fedcba98.webp" }, { id: "x", path: "../../etc" }] });
  const { deps, seen } = fakes();
  const res = await deletePhoto(req("/api/account/photo", { method: "DELETE", token: phoneToken() }), deps);
  assert.equal(res.status, 200);
  assert.equal(((await json(res)).profile as { profile_image_url: null }).profile_image_url, null);
  assert.deepEqual(net.calls("account_photo_set")[0].args, { p_key: "test-account-key", p_user_id: "acc-1", p_kind: "none", p_value: null });
  await settle();
  assert.deepEqual(seen.removed, [["fedcba9876543210fedcba98.webp"]], "only a path the bucket uses");
  assert.deepEqual(net.calls("account_photo_files_gone")[0].args.p_ids, ["ph-1"]);
});
