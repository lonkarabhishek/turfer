"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Circle, ExternalLink, Loader2, Star } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { DailyChart } from "@/components/admin/DailyChart";
import { labelFor, isCity } from "@/lib/city";
import { ownerRpc, type OwnerDashboard, type OwnerTurf } from "@/lib/my/client";
import { EditListing } from "./EditListing";
import { OwnerPhotos } from "./OwnerPhotos";
import { turfPath } from "@/lib/utils/turfPath";

const PERIODS = [7, 30, 90] as const;

/** One turf's dashboard: how players find it, how complete the listing is, and the edit form. */
export function MyTurf({ id }: { id: string }) {
  const { user, loading } = useAuth();
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<OwnerDashboard | null>(null);
  const [failed, setFailed] = useState(false);
  // Photos the public page shows (the Photos section counts them); until then, the stored count.
  const [visiblePhotos, setVisiblePhotos] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await ownerRpc<OwnerDashboard>("owner_dashboard", { p_turf_id: id, p_days: days }));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [id, days]);

  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [user, load]);

  if (loading) return <Shell><p className="text-primary-500">Loading…</p></Shell>;
  if (!user)
    return (
      <Shell>
        <p className="text-primary-700">
          <Link href={`/login?next=${encodeURIComponent(`/my/turf/${id}`)}`} className="font-semibold text-accent-700">Sign in</Link> to open this turf on myTapturf.
        </p>
      </Shell>
    );
  if (failed) return <Shell><p className="text-red-700">Couldn&rsquo;t load this turf. Check your connection and try again.</p></Shell>;
  if (!data) return <Shell><p className="text-primary-500 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading your numbers…</p></Shell>;
  if ("error" in data)
    return (
      <Shell>
        <h1 className="font-display text-2xl text-primary-900">This turf isn&rsquo;t on your account</h1>
        <p className="mt-2 text-primary-600">Claim it from <Link href={`/my?claim=${id}`} className="font-semibold text-accent-700">myTapturf</Link>, or wait for us to confirm a claim you sent.</p>
      </Shell>
    );

  const t = data.turf;
  const sum = (k: "views" | "calls" | "whatsapp") => data.series.reduce((n, d) => n + d[k], 0);
  const views = sum("views");
  const calls = sum("calls");
  const wa = sum("whatsapp");
  const place = [t.area, t.city && isCity(t.city) ? labelFor(t.city) : t.city].filter(Boolean).join(", ");

  return (
    <Shell>
      <Link href="/my" className="inline-flex items-center gap-1 text-[14px] text-primary-500 hover:text-primary-900">
        <ArrowLeft className="w-4 h-4" /> myTapturf
      </Link>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] md:text-[34px] leading-tight text-primary-900">{t.name}</h1>
          <p className="text-[14px] text-primary-500">{place}</p>
        </div>
        <Link href={turfPath(t)} target="_blank" className="shrink-0 inline-flex items-center gap-1 h-10 px-3.5 rounded-full bg-primary-100 hover:bg-primary-200 text-[13px] font-semibold text-primary-900">
          Public page <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Period */}
      <div className="mt-6 inline-flex rounded-full bg-primary-100 p-1" role="tablist" aria-label="Period">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={days === p}
            onClick={() => setDays(p)}
            className={`h-8 px-3.5 rounded-full text-[13px] font-semibold cursor-pointer transition-colors ${days === p ? "bg-white text-primary-900 shadow-soft" : "text-primary-600"}`}
          >
            {p} days
          </button>
        ))}
      </div>

      <section className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Page views" value={views} prev={data.prev.views} />
        <Stat label="Calls" value={calls} prev={data.prev.calls} />
        <Stat label="WhatsApp taps" value={wa} prev={data.prev.whatsapp} />
        <Stat label="Shown in Ask TapTurf" value={data.ask} prev={data.prev.ask} />
      </section>
      <p className="mt-2 text-[12px] text-primary-400">
        Calls and WhatsApp are taps on your buttons on TapTurf. Compared with the {data.days} days before.
      </p>

      <section className="mt-6 grid md:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-primary-200 bg-white p-4">
          <DailyChart label="Page views" points={data.series.map((d) => ({ date: d.day, count: d.views }))} />
        </div>
        <div className="rounded-2xl border border-primary-200 bg-white p-4">
          <DailyChart label="Calls and WhatsApp taps" color="#0F766E" points={data.series.map((d) => ({ date: d.day, count: d.calls + d.whatsapp }))} />
        </div>
      </section>

      <section className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-primary-50 p-4">
          <p className="text-[12px] font-semibold text-primary-500">Games hosted here</p>
          <p className="mt-1 text-[22px] font-bold text-primary-900 tabular-nums">{data.games.hosted}</p>
          <p className="text-[12px] text-primary-500">{data.games.upcoming} coming up</p>
        </div>
        <div className="rounded-2xl bg-primary-50 p-4">
          <p className="text-[12px] font-semibold text-primary-500">Rating on Google</p>
          <p className="mt-1 text-[22px] font-bold text-primary-900 tabular-nums inline-flex items-center gap-1">
            {t.rating ? Number(t.rating).toFixed(1) : "None"} {t.rating ? <Star className="w-4 h-4 fill-current text-amber-500" /> : null}
          </p>
          <p className="text-[12px] text-primary-500">{t.total_reviews ?? 0} reviews, {data.reviews.tapturf} on TapTurf</p>
        </div>
      </section>

      <Health turf={t} photos={visiblePhotos ?? t.photos} />

      <section id="photos" className="mt-10 scroll-mt-20">
        <OwnerPhotos turfId={t.id} turfName={t.name} onChanged={load} onCount={setVisiblePhotos} />
      </section>

      <EditListing turf={t} onSaved={load} />

      {data.reviews.recent.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-[22px] text-primary-900">Latest reviews</h2>
          <ul className="mt-3 space-y-2">
            {data.reviews.recent.map((r, i) => (
              <li key={i} className="rounded-2xl border border-primary-200 bg-white p-4">
                <p className="text-[13px] text-primary-500">
                  <span className="font-semibold text-primary-900">{r.author}</span> · {"★".repeat(Math.max(0, Math.min(5, r.rating)))} · {r.source === "google" ? "Google" : "TapTurf"}
                </p>
                <p className="mt-1 text-[14px] text-primary-800 leading-snug">{r.comment}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.edits.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[13px] font-semibold text-primary-500">Recent changes</h2>
          <ul className="mt-2 space-y-1 text-[13px] text-primary-600">
            {data.edits.map((e, i) => (
              <li key={i}>
                {new Date(e.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}: {e.fields.map(fieldLabel).join(", ")}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 md:py-10 pb-28">{children}</div>;
}

function Stat({ label, value, prev }: { label: string; value: number; prev: number }) {
  const diff = value - prev;
  const pct = prev > 0 ? Math.round((diff / prev) * 100) : null;
  return (
    <div className="rounded-2xl border border-primary-200 bg-white p-4">
      <p className="text-[12px] font-semibold text-primary-500">{label}</p>
      <p className="mt-1 text-[26px] font-bold text-primary-900 tabular-nums">{value.toLocaleString("en-IN")}</p>
      <p className={`text-[12px] tabular-nums ${diff > 0 ? "text-accent-700" : diff < 0 ? "text-red-600" : "text-primary-400"}`}>
        {diff === 0 ? "Same as before" : pct != null ? `${diff > 0 ? "+" : ""}${pct}%` : `${diff > 0 ? "+" : ""}${diff}`}
      </p>
    </div>
  );
}

const LABELS: Record<string, string> = {
  morning_price: "morning price",
  afternoon_price: "afternoon price",
  evening_price: "evening price",
  weekend_morning_price: "weekend morning price",
  weekend_afternoon_price: "weekend afternoon price",
  weekend_evening_price: "weekend evening price",
  start_time: "opening time",
  end_time: "closing time",
  is_24x7: "24 hours",
  closed_days: "closed days",
  description: "description",
  surface_type: "surface",
  number_of_grounds: "grounds",
  formats: "formats",
  whatsapp_phone: "WhatsApp number",
  photos_added: "new photos",
  photo_removed: "removed a photo",
  cover_image: "cover photo",
};
function fieldLabel(f: string) {
  return LABELS[f] ?? f.replace(/_/g, " ").replace(/^(has|is) /, "");
}

/** What the listing still lacks, most useful first. */
function Health({ turf: t, photos }: { turf: OwnerTurf; photos: number }) {
  const prices = [t.morning_price, t.afternoon_price, t.evening_price, t.weekend_morning_price, t.weekend_afternoon_price, t.weekend_evening_price];
  const facilities = [t.has_floodlights, t.is_covered, t.parking_available, t.washroom_available, t.changing_room_available, t.has_cafeteria, t.has_drinking_water, t.equipment_provided];
  const items: { ok: boolean; text: string; hint: string; href?: string }[] = [
    { ok: prices.some((p) => p != null && p > 0), text: "Hourly prices", hint: "Players filter by budget; turfs with prices get more calls." },
    { ok: !!t.price_owner_confirmed, text: "Prices confirmed by you", hint: "Shows players the prices come from you." },
    { ok: t.is_24x7 === true || (!!t.start_time && !!t.end_time), text: "Opening hours", hint: "So late-night and early-morning searches find you." },
    { ok: facilities.filter((f) => f != null).length >= 4, text: "Facilities", hint: "Lights, parking, washroom, covered: the questions players ask most." },
    { ok: !!t.formats?.length, text: "Formats", hint: "5-a-side, 7-a-side, box cricket sizes." },
    { ok: (t.description?.length ?? 0) >= 80, text: "A short description", hint: "Two or three lines in your own words." },
    { ok: !!t.whatsapp_phone, text: "WhatsApp number", hint: "Most players book on WhatsApp." },
    { ok: photos >= 3, text: "At least 3 photos", hint: "Add them in Photos below.", href: "#photos" },
  ];
  const done = items.filter((i) => i.ok).length;
  const pct = Math.round((done / items.length) * 100);
  return (
    <section className="mt-10">
      <div className="flex items-end justify-between gap-3">
        <h2 className="font-display text-[22px] text-primary-900">Your listing</h2>
        <p className="text-[13px] font-semibold text-primary-600 tabular-nums">{pct}% complete</p>
      </div>
      <div className="mt-2 h-2 rounded-full bg-primary-100 overflow-hidden">
        <div className="h-full rounded-full bg-accent-500" style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-3">
        {items.map((i) => (
          <li key={i.text} className="flex gap-2.5">
            {i.ok ? <Check className="w-5 h-5 shrink-0 text-accent-600" /> : <Circle className="w-5 h-5 shrink-0 text-primary-300" />}
            <span>
              <span className={`block text-[14px] font-semibold ${i.ok ? "text-primary-500" : "text-primary-900"}`}>{i.text}</span>
              {!i.ok &&
                (i.href ? (
                  <a href={i.href} className="block text-[13px] font-semibold text-accent-700 leading-snug hover:underline">{i.hint}</a>
                ) : (
                  <span className="block text-[13px] text-primary-500 leading-snug">{i.hint}</span>
                ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
