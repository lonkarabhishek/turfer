"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BarChart3, CheckCircle2, ChevronRight, Clock, Loader2, Phone, Search, Store } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { labelFor, isCity } from "@/lib/city";
import { ownerRpc, type OwnerHome, type OwnerTurfRef } from "@/lib/my/client";

const place = (t: { area: string | null; city: string | null }) =>
  [t.area, t.city && isCity(t.city) ? labelFor(t.city) : t.city].filter(Boolean).join(", ");

/** myTapturf home: a pitch when signed out; your turfs, numbers we recognise and claim search when signed in. */
export function MyHome() {
  const { user, loading } = useAuth();
  const params = useSearchParams();
  const claimId = params.get("claim");
  const [home, setHome] = useState<OwnerHome | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setHome(await ownerRpc<OwnerHome>("owner_home"));
    } catch (e) {
      setError((e as Error).message || "Couldn't load myTapturf. Try again.");
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [user, load]);

  if (loading) return <Shell><p className="text-primary-500">Loading…</p></Shell>;
  if (!user) return <Landing claimId={claimId} />;

  return (
    <Shell>
      <h1 className="font-display text-[32px] md:text-[40px] leading-tight text-primary-900">myTapturf</h1>
      <p className="mt-1 text-[15px] text-primary-500">Your turfs on TapTurf: who&rsquo;s finding you, and what they see.</p>

      {error && <p className="mt-6 rounded-2xl bg-red-50 text-red-700 px-4 py-3 text-[14px]">{error}</p>}
      {!home && !error && <p className="mt-8 text-primary-500 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading your turfs…</p>}
      {home && !home.signed_in && (
        <p className="mt-8 rounded-2xl bg-primary-50 px-4 py-3 text-[14px] text-primary-700">
          We couldn&rsquo;t confirm your sign-in. <Link href="/login?next=/my" className="font-semibold text-accent-700">Sign in again</Link>.
        </p>
      )}

      {home?.signed_in && (
        <>
          {home.turfs.length > 0 && (
            <section className="mt-8">
              <h2 className="text-[13px] font-semibold text-primary-500 mb-3">Your turfs</h2>
              <ul className="space-y-2">
                {home.turfs.map((t) => (
                  <li key={t.id}>
                    {t.status === "active" ? (
                      <Link href={`/my/turf/${t.id}`} className="press-tight flex items-center gap-3 rounded-2xl border border-primary-200 bg-white p-3 hover:border-primary-400 transition-colors">
                        <Thumb src={t.cover} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-primary-900 truncate">{t.name}</span>
                          <span className="block text-[13px] text-primary-500 truncate">{place(t)}</span>
                        </span>
                        <ChevronRight className="w-5 h-5 text-primary-400" />
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-primary-300 bg-primary-50 p-3">
                        <Thumb src={t.cover} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-primary-900 truncate">{t.name}</span>
                          <span className="block text-[13px] text-primary-500 inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> Waiting for TapTurf to confirm, usually within a day
                          </span>
                        </span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {home.matches.length > 0 && (
            <section className="mt-8">
              <h2 className="text-[13px] font-semibold text-primary-500 mb-1">Turfs that list your number</h2>
              <p className="text-[13px] text-primary-500 mb-3">Your number {home.who.replace(/^(\d{5})(\d{5})$/, "$1 $2")} is on these listings, so you can open them straight away.</p>
              <ul className="space-y-2">
                {home.matches.map((t) => (
                  <ClaimRow key={t.id} turf={t} defaultName={user.name ?? ""} onDone={load} instant />
                ))}
              </ul>
            </section>
          )}

          <ClaimSearch defaultName={user.name ?? ""} onDone={load} claimId={claimId} owned={new Set(home.turfs.map((t) => t.id))} />

          {home.admin && (
            <p className="mt-10 text-[13px] text-primary-400">
              Signed in as the TapTurf owner: open any turf at /my/turf/&lt;id&gt;, and approve claims in <Link href="/admin" className="underline">admin</Link>.
            </p>
          )}
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 md:py-12">{children}</div>;
}

function Thumb({ src }: { src: string | null }) {
  return (
    <span className="w-14 h-14 shrink-0 rounded-xl bg-primary-100 overflow-hidden">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
      ) : null}
    </span>
  );
}

/** Find your turf by name and claim it. */
function ClaimSearch({ defaultName, onDone, claimId, owned }: { defaultName: string; onDone: () => void; claimId: string | null; owned: Set<string> }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<OwnerTurfRef[]>([]);
  const [busy, setBusy] = useState(false);

  // Arrived from a turf page's "Own this turf?" link: show that turf.
  useEffect(() => {
    if (!claimId) return;
    let live = true;
    createClient()
      .from("turfs")
      .select("id, name, city, area, cover_image")
      .eq("id", claimId)
      .eq("is_active", true)
      .maybeSingle()
      .then(({ data }) => {
        if (live && data) setHits([{ id: data.id, name: data.name, city: data.city, area: data.area, cover: data.cover_image }]);
      });
    return () => {
      live = false;
    };
  }, [claimId]);

  const search = async (term: string) => {
    const s = term.trim();
    if (s.length < 3) return;
    setBusy(true);
    const { data } = await createClient()
      .from("turfs")
      .select("id, name, city, area, cover_image")
      .eq("is_active", true)
      .ilike("name", `%${s.replace(/[%_,()]/g, " ")}%`)
      .order("total_reviews", { ascending: false })
      .limit(8);
    setHits((data ?? []).map((t) => ({ id: t.id, name: t.name, city: t.city, area: t.area, cover: t.cover_image })));
    setBusy(false);
  };

  return (
    <section className="mt-10">
      <h2 className="text-[13px] font-semibold text-primary-500 mb-3">Claim a turf</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search(q);
        }}
        className="relative"
      >
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-primary-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search your turf by name"
          className="w-full h-12 pl-11 pr-24 rounded-full border border-primary-200 bg-white text-[16px] focus:outline-none focus:border-primary-400"
        />
        <button type="submit" className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 px-4 rounded-full bg-primary-900 text-white text-[14px] font-semibold cursor-pointer">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
        </button>
      </form>
      {hits.length > 0 && (
        <ul className="mt-3 space-y-2">
          {hits.map((t) =>
            owned.has(t.id) ? null : <ClaimRow key={t.id} turf={t} defaultName={defaultName} onDone={onDone} />,
          )}
        </ul>
      )}
      <p className="mt-3 text-[13px] text-primary-500">
        Sign in with the number listed on your turf and you get in at once. Any other number, we check with you first.
      </p>
    </section>
  );
}

function ClaimRow({ turf, defaultName, onDone, instant = false }: { turf: OwnerTurfRef; defaultName: string; onDone: () => void; instant?: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "pending" | "error">("idle");
  const [msg, setMsg] = useState("");

  const claim = async () => {
    setState("busy");
    try {
      const r = await ownerRpc<{ status?: string; error?: string }>("owner_claim", { p_turf_id: turf.id, p_name: name, p_note: note });
      if (r.status === "active") {
        window.location.href = `/my/turf/${turf.id}`;
        return;
      }
      if (r.status === "pending") {
        setState("pending");
        onDone();
        return;
      }
      setState("error");
      setMsg(
        r.error === "sign_in" ? "Please sign in again." : r.error === "too_many" ? "You have five claims waiting already. We'll get to them soon." : r.error === "revoked" ? "Access to this turf was removed. Email info@tapturf.in." : "Couldn't send that. Try again.",
      );
    } catch {
      setState("error");
      setMsg("Couldn't send that. Try again.");
    }
  };

  return (
    <li className="rounded-2xl border border-primary-200 bg-white p-3">
      <div className="flex items-center gap-3">
        <Thumb src={turf.cover} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-primary-900 truncate">{turf.name}</span>
          <span className="block text-[13px] text-primary-500 truncate">{place(turf)}</span>
        </span>
        {state === "pending" ? (
          <span className="text-[13px] text-primary-600 inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-accent-600" /> Sent</span>
        ) : instant ? (
          <button type="button" onClick={() => void claim()} disabled={state === "busy"} className="h-10 px-4 rounded-full bg-accent-500 hover:bg-accent-600 text-white text-[14px] font-semibold cursor-pointer disabled:opacity-60">
            {state === "busy" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Open"}
          </button>
        ) : (
          <button type="button" onClick={() => setOpen((o) => !o)} className="h-10 px-4 rounded-full bg-primary-100 hover:bg-primary-200 text-primary-900 text-[14px] font-semibold cursor-pointer">
            This is mine
          </button>
        )}
      </div>
      {open && state !== "pending" && !instant && (
        <div className="mt-3 space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={80} className="w-full h-11 px-4 rounded-xl border border-primary-200 text-[15px] focus:outline-none focus:border-primary-400" />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Your role (owner, manager) and anything that helps us confirm it" maxLength={400} rows={2} className="w-full px-4 py-2.5 rounded-xl border border-primary-200 text-[15px] focus:outline-none focus:border-primary-400" />
          <button type="button" onClick={() => void claim()} disabled={state === "busy" || !name.trim()} className="h-11 px-5 rounded-full bg-primary-900 text-white text-[14px] font-semibold cursor-pointer disabled:opacity-50">
            {state === "busy" ? "Sending…" : "Claim this turf"}
          </button>
        </div>
      )}
      {state === "pending" && <p className="mt-2 text-[13px] text-primary-600">Thanks. We&rsquo;ll confirm it and it will show under Your turfs, usually within a day.</p>}
      {state === "error" && <p className="mt-2 text-[13px] text-hot-600">{msg}</p>}
    </li>
  );
}

/** Signed out: what myTapturf is, and one way in. */
function Landing({ claimId }: { claimId: string | null }) {
  const next = claimId ? `/my?claim=${encodeURIComponent(claimId)}` : "/my";
  const points = [
    { icon: BarChart3, title: "See who finds you", text: "Page views, calls and WhatsApp taps, and how often Ask TapTurf shows your turf, day by day." },
    { icon: Store, title: "Keep your listing right", text: "Update prices, hours, facilities and your WhatsApp number. Changes go live within a minute." },
    { icon: Phone, title: "Free, no app to install", text: "Sign in with the number on your listing and you are in. Players still call you directly." },
  ];
  return (
    <Shell>
      <p className="text-[13px] font-semibold text-accent-700">For turf owners</p>
      <h1 className="mt-1 font-display text-[36px] md:text-[48px] leading-[1.05] text-primary-900">
        myTapturf
      </h1>
      <p className="mt-3 text-[17px] text-primary-600 leading-snug">Your turf on TapTurf, in your hands. See how many players look at it and call you, and keep your details up to date.</p>
      <ul className="mt-8 space-y-4">
        {points.map((p) => (
          <li key={p.title} className="flex gap-3">
            <span className="w-10 h-10 shrink-0 rounded-full bg-accent-50 text-accent-700 inline-flex items-center justify-center">
              <p.icon className="w-5 h-5" />
            </span>
            <span>
              <span className="block font-semibold text-primary-900">{p.title}</span>
              <span className="block text-[14px] text-primary-600 leading-snug">{p.text}</span>
            </span>
          </li>
        ))}
      </ul>
      <Link href={`/login?next=${encodeURIComponent(next)}`} className="press-tight mt-8 inline-flex h-12 items-center rounded-full bg-accent-500 hover:bg-accent-600 px-7 text-[16px] font-semibold text-white transition-colors">
        Sign in to start
      </Link>
      <p className="mt-3 text-[13px] text-primary-500">Questions? Email <a href="mailto:info@tapturf.in" className="underline">info@tapturf.in</a>.</p>
    </Shell>
  );
}
