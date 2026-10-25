import { z } from "zod";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createGuardedFetch, defaultGuardOptions } from "@/lib/supabase/guard";
import { accountKey } from "@/lib/account/server";
import { ROUTER_MODEL, isAskConfigured, structured } from "@/lib/ai/ask";
import { fetchImage, type Fetched } from "@/lib/ai/covers";
import { chunks, judgeFailure, toCheckItems, verdictsFor, type CheckItem, type Verdict } from "./photoCheck";

/**
 * Server only. The check of photos owners add: Claude Haiku looks at each
 * new photo and its card before it goes on the page, and anything that
 * isn't the venue (posters, price lists, screenshots, blur) is held for
 * the admin (owner_photo_verdicts). The functions take the server key
 * (ACCOUNT_KEY), so owners can't pass their own photos. Run by
 * /api/my/photos/check right after an upload, by /api/my/photos/sweep
 * (the database's minute job) for anything that check missed, and by
 * admin's Check now.
 */

export type JudgeResult =
  | { ok: true; checked: number; live: string[]; held: string[]; skipped?: "not_configured" | "judge_down" }
  | { ok: false; error: string };

const SHOWS = ["pitch", "facility", "people_playing", "entrance", "logo_or_poster", "screenshot_or_map", "other"] as const;
const Judgement = z.object({
  photos: z.array(
    z.object({
      index: z.number(),
      /** False for anything that isn't a real photo of the venue. */
      usable: z.boolean(),
      /** The two images are the same picture. */
      same: z.boolean(),
      /** 1 poor to 5 excellent, as a listing photo. */
      quality: z.number(),
      shows: z.enum(SHOWS),
      /** Under 12 words, for the owner. */
      note: z.string(),
    }),
  ),
});

const SYSTEM = `You check photos that a venue's owner uploaded to its listing on a sports venue directory in India. Players see them on the venue's page. Each photo is numbered from 0 and sent as two images: the photo, then a small copy of it. Reply only with the JSON object.

For every photo give usable, same, quality 1 to 5, what it shows, and a note under 12 words written to the owner.
- Usable: real photos of the venue: the playing surface (turf, cage, court), the facility (stands, changing rooms, cafe, parking, entrance), people playing there. Night shots under floodlights are fine.
- Not usable: posters, logos, banners or price lists that are mostly text, app or chat screenshots, maps, heavily blurred or very dark photos, photos of unrelated things (food, cars, documents, selfies or close-up faces), and anything violent, sexual or offensive.
- same is false when the small copy is not the same picture as the photo.
- For a photo that isn't usable, the note says why in plain words, for example "Looks like a price list, not the ground".`;

// Its own breaker: a failing check must not make page refreshes fail fast.
const judgeFetch = createGuardedFetch(defaultGuardOptions());
let client: SupabaseClient | null = null;

function judgeClient(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) throw new Error("Missing Supabase environment variables");
    client = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: judgeFetch } });
  }
  return client;
}

type Loaded = { item: CheckItem; full: Fetched; card: Fetched };

/** One judge call; throws when the call fails. */
async function judge(sent: Loaded[]): Promise<Verdict[]> {
  const content: ({ type: "image"; source: { type: "base64"; media_type: Fetched["media"]; data: string } } | { type: "text"; text: string })[] = [];
  sent.forEach((s, i) => {
    content.push({ type: "text", text: `Photo ${i}` });
    content.push({ type: "image", source: { type: "base64", media_type: s.full.media, data: s.full.data } });
    content.push({ type: "image", source: { type: "base64", media_type: s.card.media, data: s.card.data } });
  });
  content.push({ type: "text", text: `Check the ${sent.length} ${sent.length === 1 ? "photo" : "photos"} above.` });
  const info: { refused?: boolean } = {};
  const out = await structured(
    Judgement,
    {
      model: ROUTER_MODEL,
      max_tokens: 700,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
    },
    "owner-photos",
    undefined,
    info,
  );
  return verdictsFor(
    sent.map((s) => s.item),
    out?.photos ?? null,
    info.refused === true,
  );
}

/**
 * Judge a turf's photos that are due a check (up to 9 a call; each is
 * claimed for 3 minutes, so two checks never judge one). force: admin's
 * Check now, even while claimed.
 */
export async function checkOwnerPhotos(turfId: string, force = false): Promise<JudgeResult> {
  const key = accountKey();
  if (!key) return { ok: false, error: "not_configured" };
  try {
    const db = judgeClient();
    const { data, error } = await db.rpc("owner_photos_to_check", { p_key: key, p_turf_id: turfId, p_force: force });
    if (error) return { ok: false, error: error.message };
    if ((data as { error?: unknown } | null)?.error) return { ok: false, error: String((data as { error: unknown }).error) };
    const items = toCheckItems(data);
    if (items.length === 0) return { ok: true, checked: 0, live: [], held: [] };
    // No judge: they wait, and the minute job puts them up after 10 minutes.
    if (!isAskConfigured()) return { ok: true, checked: 0, live: [], held: [], skipped: "not_configured" };

    const verdicts: Verdict[] = [];
    let down = false;
    for (const part of chunks(items)) {
      const loaded = await Promise.all(
        part.map(async (item): Promise<Loaded | null> => {
          const [full, card] = await Promise.all([fetchImage(item.url, 0, true), fetchImage(item.cardUrl, 1, true)]);
          return full && card ? { item, full, card } : null;
        }),
      );
      part.forEach((item, i) => {
        if (!loaded[i]) verdicts.push({ id: item.id, outcome: "unloadable" });
      });
      const sent = loaded.filter((l): l is Loaded => !!l);
      if (sent.length === 0) continue;
      try {
        verdicts.push(...(await judge(sent)));
      } catch (e) {
        if (judgeFailure(e) === "down") {
          console.warn("owner photos: judge down", e);
          down = true;
          break;
        }
        // One file the API can't read fails the whole call: judge them one by one.
        for (const one of sent) {
          try {
            verdicts.push(...(await judge([one])));
          } catch (e2) {
            if (judgeFailure(e2) === "down") {
              down = true;
              break;
            }
            verdicts.push({ id: one.item.id, outcome: "unreadable" });
          }
        }
        if (down) break;
      }
    }
    if (verdicts.length === 0) return { ok: true, checked: 0, live: [], held: [], ...(down ? { skipped: "judge_down" as const } : {}) };

    const res = await db.rpc("owner_photo_verdicts", { p_key: key, p_turf_id: turfId, p_verdicts: verdicts });
    if (res.error) return { ok: false, error: res.error.message };
    const r = (res.data ?? {}) as { ok?: boolean; checked?: unknown; live?: unknown; held?: unknown; error?: unknown };
    if (r.ok !== true) return { ok: false, error: String(r.error ?? "unavailable") };
    const ids = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : []);
    return {
      ok: true,
      checked: typeof r.checked === "number" ? r.checked : 0,
      live: ids(r.live),
      held: ids(r.held),
      ...(down ? { skipped: "judge_down" as const } : {}),
    };
  } catch (e) {
    console.warn("owner photos: check failed", e);
    return { ok: false, error: "unavailable" };
  }
}

export type SweepResult = { ok: true; turfs: number; checked: number; removedFiles: number } | { ok: false; error: string };

/**
 * The minute job's work (/api/my/photos/sweep): check the photos due (a
 * few turfs, within the time a function has), then remove the files of
 * removed photos and unused tickets.
 */
export async function sweepOwnerPhotos(budgetMs = 40_000): Promise<SweepResult> {
  const key = accountKey();
  if (!key) return { ok: false, error: "not_configured" };
  const began = Date.now();
  try {
    const db = judgeClient();
    const { data, error } = await db.rpc("owner_photos_sweep_list", { p_key: key });
    if (error) return { ok: false, error: error.message };
    const d = (data ?? {}) as { ok?: boolean; turfs?: unknown; files?: unknown; error?: unknown };
    if (d.ok !== true) return { ok: false, error: String(d.error ?? "unavailable") };
    const turfs = Array.isArray(d.turfs) ? d.turfs.filter((t): t is string => typeof t === "string") : [];
    let done = 0;
    let checked = 0;
    for (const t of turfs) {
      if (Date.now() - began > budgetMs) break;
      const r = await checkOwnerPhotos(t);
      done++;
      if (r.ok) checked += r.checked;
      if (r.ok && r.skipped === "judge_down") break;
    }

    const files = (Array.isArray(d.files) ? d.files : [])
      .map((f) => (f ?? {}) as { id?: unknown; paths?: unknown })
      .filter((f): f is { id: string; paths: string[] } => typeof f.id === "string" && Array.isArray(f.paths) && f.paths.every((p) => typeof p === "string"));
    let removedFiles = 0;
    if (files.length > 0) {
      const rm = await db.storage.from("turf-photos").remove(files.flatMap((f) => f.paths));
      if (!rm.error) {
        removedFiles = Array.isArray(rm.data) ? rm.data.length : 0;
        await db.rpc("owner_photo_files_gone", { p_key: key, p_ids: files.map((f) => f.id) });
      } else {
        console.warn("owner photos: removing files failed", rm.error.message);
      }
    }
    return { ok: true, turfs: done, checked, removedFiles };
  } catch (e) {
    console.warn("owner photos: sweep failed", e);
    return { ok: false, error: "unavailable" };
  }
}
