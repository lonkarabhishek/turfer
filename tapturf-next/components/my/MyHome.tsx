"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BarChart3, CheckCircle2, ChevronRight, Clock, Loader2, Phone, Search, Store } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { labelFor, isCity } from "@/lib/city";
import { ownerRpc, refreshTurfPage, type OwnerHome, type OwnerTurfRef } from "@/lib/my/client";

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
          {claimId && <ClaimFocus claimId={claimId} home={home} defaultName={user.name ?? ""} onDone={load} />}

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

          <ClaimSearch defaultName={user.name ?? ""} onDone={load} owned={new Set(home.turfs.map((t) => t.id))} admin={home.admin} />

          {home.admin && (
            <p className="mt-10 text-[13px] text-primary-400">
              Signed in as the TapTurf owner: every turf opens for you without a claim, and owners&rsquo; claims wait for you in <Link href="/admin" className="underline">admin</Link>.
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

/** Name, place and photo of one public listing. */
function usePublicTurf(id: string | null) {
  const [turf, setTurf] = useState<OwnerTurfRef | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    createClient()
      .from("turfs")
      .select("id, name, city, area, cover_image")
      .eq("id", id)
      .eq("is_active", true)
      .maybeSingle()
      .then(({ data }) => {
        if (live && data) setTurf({ id: data.id, name: data.name, city: data.city, area: data.area, cover: data.cover_image });
      });
    return () => {
      live = false;
    };
  }, [id]);
  return turf;
}

/** Arrived from "Claim this listing" on a turf page: that turf, first, with the form open. */
function ClaimFocus({ claimId, home, defaultName, onDone }: { claimId: string; home: Extract<OwnerHome, { signed_in: true }>; defaultName: string; onDone: () => void }) {
  const turf = usePublicTurf(claimId);
  if (!turf) return null;
  const mine = home.turfs.find((t) => t.id === claimId);
  const match = home.matches.some((t) => t.id === claimId);
  return (
    <section className="mt-6 rounded-3xl border-2 border-accent-200 bg-accent-50/40 p-3 md:p-4">
      <p className="px-1 mb-2 text-[13px] font-semibold text-accent-700">Claim this listing</p>
      {mine?.status === "active" || home.admin ? (
        <Link href={`/my/turf/${claimId}`} className="flex items-center gap-3 rounded-2xl bg-white border border-primary-200 p-3">
          <Thumb src={turf.cover} />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-primary-900 truncate">{turf.name}</span>
            <span className="block text-[13px] text-accent-700">You manage this turf. Open your dashboard</span>
          </span>
          <ChevronRight className="w-5 h-5 text-primary-400" />
        </Link>
      ) : mine?.status === "pending" ? (
        <div className="flex items-center gap-3 rounded-2xl bg-white border border-primary-200 p-3">
          <Thumb src={turf.cover} />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-primary-900 truncate">{turf.name}</span>
            <span className="block text-[13px] text-primary-600">Your claim is with us. We&rsquo;ll confirm it, usually within a day.</span>
          </span>
        </div>
      ) : (
        <ul>
          <ClaimRow turf={turf} defaultName={defaultName} onDone={onDone} instant={match} startOpen />
        </ul>
      )}
      {!mine && !match && !home.admin && (
        <p className="px-1 mt-2 text-[13px] text-primary-600 leading-snug">
          Your number isn&rsquo;t on this listing, so we&rsquo;ll confirm with you before it opens. Tip: sign in with the number players call to get in at once.
        </p>
      )}
    </section>
  );
}

/** Find your turf by name and claim it. */
function ClaimSearch({ defaultName, onDone, owned, admin = false }: { defaultName: string; onDone: () => void; owned: Set<string>; admin?: boolean }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<OwnerTurfRef[]>([]);
  const [busy, setBusy] = useState(false);

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
      <h2 className="text-[13px] font-semibold text-primary-500 mb-3">{admin ? "Open any turf" : "Claim a turf"}</h2>
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
            admin ? (
              <li key={t.id}>
                <Link href={`/my/turf/${t.id}`} className="press-tight flex items-center gap-3 rounded-2xl border border-primary-200 bg-white p-3 hover:border-primary-400 transition-colors">
                  <Thumb src={t.cover} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-primary-900 truncate">{t.name}</span>
                    <span className="block text-[13px] text-primary-500 truncate">{place(t)}</span>
                  </span>
                  <ChevronRight className="w-5 h-5 text-primary-400" />
                </Link>
              </li>
            ) : owned.has(t.id) ? null : (
              <ClaimRow key={t.id} turf={t} defaultName={defaultName} onDone={onDone} />
            ),
          )}
        </ul>
      )}
      {!admin && (
        <p className="mt-3 text-[13px] text-primary-500">
          Sign in with the number listed on your turf and you get in at once. Any other number, we check with you first.
        </p>
      )}
    </section>
  );
}

function ClaimRow({ turf, defaultName, onDone, instant = false, startOpen = false }: { turf: OwnerTurfRef; defaultName: string; onDone: () => void; instant?: boolean; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [name, setName] = useState(defaultName);
  const [role, setRole] = useState<"owner" | "manager" | "staff">("owner");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "pending" | "error">("idle");
  const [msg, setMsg] = useState("");

  const claim = async () => {
    setState("busy");
    try {
      const r = await ownerRpc<{ status?: string; error?: string }>("owner_claim", { p_turf_id: turf.id, p_name: name, p_note: note, p_role: role });
      if (r.status === "active") {
        await refreshTurfPage(turf.id);
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
          <div className="inline-flex rounded-full bg-primary-100 p-0.5" role="radiogroup" aria-label="Your role">
            {(["owner", "manager", "staff"] as const).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={role === r}
                onClick={() => setRole(r)}
                className={`h-9 px-4 rounded-full text-[14px] font-medium capitalize cursor-pointer transition-colors ${role === r ? "bg-white text-primary-900 shadow-soft" : "text-primary-600"}`}
              >
                {r}
              </button>
            ))}
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything that helps us confirm it, e.g. the number players call" maxLength={400} rows={2} className="w-full px-4 py-2.5 rounded-xl border border-primary-200 text-[15px] focus:outline-none focus:border-primary-400" />
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
  const claiming = usePublicTurf(claimId);
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
      {claiming && (
        <div className="mt-8 flex items-center gap-3 rounded-2xl border border-primary-200 bg-white p-3">
          <Thumb src={claiming.cover} />
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold text-accent-700">You&rsquo;re claiming</span>
            <span className="block font-semibold text-primary-900 truncate">{claiming.name}</span>
            <span className="block text-[13px] text-primary-500 truncate">{place(claiming)}</span>
          </span>
        </div>
      )}
      <Link href={`/login?next=${encodeURIComponent(next)}`} className={`press-tight ${claiming ? "mt-4" : "mt-8"} inline-flex h-12 items-center rounded-full bg-accent-500 hover:bg-accent-600 px-7 text-[16px] font-semibold text-white transition-colors`}>
        {claiming ? "Sign in to claim it" : "Sign in to start"}
      </Link>
      {claiming && <p className="mt-2 text-[13px] text-primary-500">Use the number players call for this turf and you get in straight away.</p>}
      <p className="mt-3 text-[13px] text-primary-500">Questions? Email <a href="mailto:info@tapturf.in" className="underline">info@tapturf.in</a>.</p>
    </Shell>
  );
}
