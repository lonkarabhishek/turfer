"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { RecaptchaVerifier } from "firebase/auth";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BarChart3, CheckCircle2, ChevronRight, Clock, Loader2, Navigation, Phone, Search, Store, Users } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { labelFor, isCity } from "@/lib/city";
import { ownerRpc, refreshTurfPage, type ClaimInfo, type ClaimResult, type OwnerHome, type OwnerTurfRef } from "@/lib/my/client";
import { sendClaimCode, type ClaimCode } from "@/lib/firebase/proof";
import { firstImageUrl, imageUrlForCard } from "@/lib/utils/images";
import { cleanVenueName } from "@/lib/utils/bookingApps";
import { contactFieldsOf, hasUsableContact } from "@/lib/utils/contact";
import {
  CLAIM_FLOW_COPY as COPY,
  CLAIM_ROLES,
  ROLE_LABELS,
  asksRunsQuestion,
  claimLoginUrl,
  claimOwnerUrl,
  claimTurfId,
  turfPhone10,
  type ClaimRole,
} from "@/lib/my/claimFlow";
import { ManagerNameNote } from "./ManagerNameNote";

const place = (t: { area: string | null; city: string | null }) =>
  [t.area, t.city && isCity(t.city) ? labelFor(t.city) : t.city].filter(Boolean).join(", ");

/**
 * myTapturf home: a pitch when signed out; your turfs, numbers we recognise and claim search when signed in.
 * From a turf page's claim link (?claim=<turf id>) it first asks "Do you own or manage <turf>?"
 * (lib/my/claimFlow.ts): players who came to book are sent back to the turf's page; owners answer once.
 */
export function MyHome() {
  const { user, loading } = useAuth();
  const params = useSearchParams();
  const claimId = claimTurfId(params?.get("claim"));
  const saidOwner = params?.get("owner") === "1";
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
  if (!user) return claimId && !saidOwner ? <ClaimQuestion claimId={claimId} signedIn={false} /> : <Landing claimId={claimId} />;

  // Signed in from a claim link: the question too, unless they answered it, run the turf already,
  // have a claim waiting, or their own number is on the listing.
  if (claimId && home?.signed_in) {
    const mine = home.turfs.find((t) => t.id === claimId);
    const state = { admin: home.admin, status: mine?.status ?? null, match: home.matches.some((t) => t.id === claimId) };
    if (asksRunsQuestion({ saidOwner, home: state })) return <ClaimQuestion claimId={claimId} signedIn />;
  }

  // Claims are made as the signed-in account (its name, never this device's copy). None to claim as: no claim form.
  // A database from before accounts on claims sends no account at all: claim as before.
  const linked = home?.signed_in && (!("account" in home) || !!home.account || home.admin);
  const me: Me | null = home?.signed_in && linked ? { kind: home.kind, who: home.who, name: home.account?.name ?? null } : null;

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
          {claimId && me && <ClaimFocus claimId={claimId} home={home} me={me} onDone={load} />}

          {!me && !home.admin && (
            <p className="mt-6 rounded-2xl bg-amber-50 px-4 py-3 text-[14px] text-amber-900">
              {home.account_state === "conflict"
                ? "This number is on an account that logs in with Google. Log in with Google, open Profile and tap Confirm with OTP. Then this number works here too."
                : "Your sign-in isn't linked to a TapTurf account yet, so you can't claim a turf. Sign out, sign in again, then try once more."}
            </p>
          )}

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
                            <Clock className="w-3.5 h-3.5 shrink-0" /> {COPY.waiting}
                          </span>
                        </span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <RunsNote home={home} />
            </section>
          )}

          {me && home.matches.length > 0 && (
            <section className="mt-8">
              <h2 className="text-[13px] font-semibold text-primary-500 mb-1">Turfs that list your number</h2>
              <p className="text-[13px] text-primary-500 mb-3">
                Your number {home.who.replace(/^(\d{5})(\d{5})$/, "$1 $2")} is on these listings, so you can open them straight away. A turf you open then
                shows the Claimed badge on its page, and says &ldquo;Managed by @your-username&rdquo; if you have a username.
              </p>
              <ul className="space-y-2">
                {home.matches.map((t) => (
                  me && <ClaimRow key={t.id} turf={t} me={me} onDone={load} instant />
                ))}
              </ul>
            </section>
          )}

          <ClaimSearch me={me} onDone={load} owned={new Set([...home.turfs.map((t) => t.id), ...(claimId ? [claimId] : [])])} matches={new Set(home.matches.map((t) => t.id))} admin={home.admin} />

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

/** Under your turfs, once one is confirmed: a username puts "Managed by @you" on its page. */
function RunsNote({ home }: { home: Extract<OwnerHome, { signed_in: true }> }) {
  const active = home.turfs.filter((t) => t.status === "active");
  // No account for this sign-in (an old claim made before claims named one): no username to pick yet.
  if (active.length === 0 || ("account" in home && !home.account)) return null;
  // owner_home's own read of the account (fresh); a database from before it sends none: the profile's.
  const username = "account" in home ? (home.account?.username ?? null) : undefined;
  return <ManagerNameNote className="mt-3" turfName={active.length === 1 ? cleanVenueName(active[0].name) : null} username={username} />;
}

function Thumb({ src }: { src: string | null }) {
  const [broken, setBroken] = useState(false);
  // The card-sized copy, with Drive and Google links made displayable, as cards do.
  // firstImageUrl normalises it and leaves out a booking app's photo (playo.gumlet.io, cdn.district.in).
  const cover = firstImageUrl(src);
  const url = cover ? imageUrlForCard(cover) : null;
  return (
    <span className="w-14 h-14 shrink-0 rounded-xl bg-primary-100 overflow-hidden">
      {url && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)} />
      ) : null}
    </span>
  );
}

/** One public listing: its name, place, photo, page and whether its page shows Call or WhatsApp (the page's own rule). */
type PublicTurf = OwnerTurfRef & { slug: string | null; hasNumber: boolean };

/** Name, place and photo of one public listing. */
function usePublicTurf(id: string | null) {
  const [turf, setTurf] = useState<PublicTurf | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    createClient()
      .from("turfs")
      .select("id, name, slug, city, area, cover_image, owner_phone, contact_info, landline_phone, whatsapp_phone")
      .eq("id", id)
      .eq("is_active", true)
      .maybeSingle()
      .then(({ data }) => {
        if (live && data)
          setTurf({
            id: data.id,
            name: cleanVenueName(data.name),
            slug: data.slug ?? null,
            city: data.city,
            area: data.area,
            cover: firstImageUrl(data.cover_image),
            hasNumber: hasUsableContact(contactFieldsOf(data)),
          });
      });
    return () => {
      live = false;
    };
  }, [id]);
  return turf;
}

/** The turf being claimed, as a card: photo, name, place. */
function TurfCard({ turf, label }: { turf: PublicTurf; label?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-primary-200 bg-white p-3">
      <Thumb src={turf.cover} />
      <span className="min-w-0">
        {label && <span className="block text-[12px] font-semibold text-accent-700">{label}</span>}
        <span className="block font-semibold text-primary-900 truncate">{turf.name}</span>
        <span className="block text-[13px] text-primary-500 truncate">{place(turf)}</span>
      </span>
    </div>
  );
}

/**
 * Before the sign-in and before the form: "Do you own or manage <turf>?". Yes is one tap (to the
 * sign-in, or to the form when signed in; owner=1 keeps the answer). No: the site owner's line for
 * players and the way back to the turf's page, where they call, WhatsApp or get directions (on a
 * page with no number, no booking line: directions, or tell us the number).
 */
function ClaimQuestion({ claimId, signedIn }: { claimId: string; signedIn: boolean }) {
  const turf = usePublicTurf(claimId);
  const [playing, setPlaying] = useState(false);
  const name = turf?.name ?? "this turf";
  const hasNumber = turf?.hasNumber ?? true;
  const yesHref = signedIn ? claimOwnerUrl(claimId) : claimLoginUrl(claimId);
  const turfHref = turf ? `/turf/${turf.slug ?? turf.id}` : null;
  const answer = "press-tight flex w-full min-h-[64px] items-center gap-3 rounded-2xl border-2 bg-white px-4 py-3 text-left transition-colors cursor-pointer";
  return (
    <Shell>
      <p className="text-[13px] font-semibold text-accent-700">{COPY.label}</p>
      {turf && (
        <div className="mt-3">
          <TurfCard turf={turf} />
        </div>
      )}
      <h1 className="mt-5 font-display text-[28px] md:text-[36px] leading-[1.1] text-primary-900 [overflow-wrap:anywhere]">{COPY.question(name)}</h1>
      {!playing ? (
        <>
          <p className="mt-2 text-[15px] text-primary-600 leading-snug">{COPY.lead}</p>
          <div className="mt-6 space-y-3" role="group" aria-label={COPY.question(name)}>
            <Link href={yesHref} className={`${answer} border-primary-200 hover:border-primary-400`}>
              <span className="size-11 shrink-0 rounded-full bg-accent-50 text-accent-700 flex items-center justify-center">
                <Store className="w-5 h-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold text-primary-900 leading-snug">{COPY.yes}</span>
                <span className="block text-[13px] text-primary-500 leading-snug">{COPY.yesSub}</span>
              </span>
              <ChevronRight className="w-5 h-5 shrink-0 text-primary-400" aria-hidden />
            </Link>
            <button type="button" onClick={() => setPlaying(true)} className={`${answer} border-primary-200 hover:border-primary-400`}>
              <span className="size-11 shrink-0 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center">
                <Users className="w-5 h-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold text-primary-900 leading-snug">{COPY.no}</span>
                {turf && <span className="block text-[13px] text-primary-500 leading-snug">{COPY.noSub(hasNumber)}</span>}
              </span>
              <ChevronRight className="w-5 h-5 shrink-0 text-primary-400" aria-hidden />
            </button>
          </div>
          <p className="mt-6 text-[13px] text-primary-500">Questions? Email <a href="mailto:info@tapturf.in" className="underline">info@tapturf.in</a>.</p>
        </>
      ) : (
        <section aria-live="polite" className="mt-6 rounded-3xl border border-primary-200 bg-primary-50/60 p-5">
          <p className="font-serif text-[22px] font-bold leading-tight text-primary-900">{COPY.playTitle(hasNumber)}</p>
          <p className="mt-2 text-[15px] text-primary-600 leading-snug">{COPY.playBody(name, hasNumber)}</p>
          {turfHref && (
            <Link href={turfHref} className="press-tight mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent-500 hover:bg-accent-600 px-5 text-[15px] font-semibold text-white transition-colors">
              {hasNumber ? <Phone className="w-4 h-4" aria-hidden /> : <Navigation className="w-4 h-4" aria-hidden />}
              {COPY.playButton(hasNumber)}
            </Link>
          )}
          <button type="button" onClick={() => setPlaying(false)} className="mt-3 inline-flex min-h-11 items-center text-[14px] font-semibold text-primary-700 underline underline-offset-2 cursor-pointer">
            {COPY.playUndo}
          </button>
        </section>
      )}
    </Shell>
  );
}

/** Who claims are made as: the signed-in TapTurf account, never a name typed in. */
type Me = { kind: "phone" | "email"; who: string; name: string | null };

const spaced = (p10: string) => p10.replace(/^(\d{5})(\d{5})$/, "$1 $2");

/** Arrived from "Claim this listing" on a turf page: that turf, first, with the form open. */
function ClaimFocus({ claimId, home, me, onDone }: { claimId: string; home: Extract<OwnerHome, { signed_in: true }>; me: Me; onDone: () => void }) {
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
      ) : (
        <ul>
          <ClaimRow turf={turf} me={me} onDone={onDone} instant={match} pending={mine?.status === "pending"} pageHasNumber={turf.hasNumber} startOpen />
        </ul>
      )}
    </section>
  );
}

/** Find your turf by name and claim it. */
function ClaimSearch({ me, onDone, owned, matches, admin = false }: { me: Me | null; onDone: () => void; owned: Set<string>; matches: Set<string>; admin?: boolean }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<(OwnerTurfRef & { hasNumber: boolean })[]>([]);
  const [busy, setBusy] = useState(false);

  const search = async (term: string) => {
    const s = term.trim();
    if (s.length < 3) return;
    setBusy(true);
    const { data } = await createClient()
      .from("turfs")
      .select("id, name, city, area, cover_image, owner_phone, contact_info, landline_phone, whatsapp_phone")
      .eq("is_active", true)
      .ilike("name", `%${s.replace(/[%_,()]/g, " ")}%`)
      .order("total_reviews", { ascending: false })
      .limit(8);
    // The name as the turf page shows it: no booking app's attribution ("FS Turf, Churchgate - by SPORLOC").
    setHits((data ?? []).map((t) => ({ id: t.id, name: cleanVenueName(t.name), city: t.city, area: t.area, cover: firstImageUrl(t.cover_image), hasNumber: hasUsableContact(contactFieldsOf(t)) })));
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
            ) : owned.has(t.id) || !me ? null : (
              <ClaimRow key={t.id} turf={t} me={me} onDone={onDone} instant={matches.has(t.id)} pageHasNumber={t.hasNumber} />
            ),
          )}
        </ul>
      )}
      {!admin && (
        <p className="mt-3 text-[13px] text-primary-500">
          Have the phone with the number on your listing? We send it a code and you get in at once. Otherwise we check with you first, usually within a day.
        </p>
      )}
    </section>
  );
}

type Step = "verify" | "code" | "manual" | "sent";
type PhoneListed = { listed?: boolean; blocked?: boolean; status?: string; retry_in?: number; error?: string };

const CLAIM_ERRORS: Record<string, string> = {
  sign_in: "Please sign in again.",
  no_account: "We couldn't find your TapTurf account for this sign-in. Sign out, sign in again, then try once more.",
  too_many: "You have five claims waiting already. We'll get to them soon.",
  revoked: "Access to this turf was removed. Email info@tapturf.in.",
  other_account: "This login's earlier claim on this turf belongs to another TapTurf account. Email info@tapturf.in and we'll sort it out.",
  not_found: "This turf isn't on TapTurf any more.",
  bad_phone: "Enter the 10-digit mobile number, like 98765 43210.",
  not_listed: "That number isn't on this listing.",
  bad_code: "We couldn't confirm that code. Send a new one and try again.",
  wait: "A code was asked for this number a moment ago. Wait a minute and try again.",
  number_busy: "This number has had a lot of codes today. Sign in to TapTurf with this number instead and it opens straight away, or send your claim for a check.",
  needs_check: "We need to check this one by hand. Send your claim and we'll confirm it, usually within a day.",
};

const RESEND_S = 120;
/** A proof is good for 10 minutes on the server; reuse it a little less than that. */
const PROOF_MS = 9 * 60_000;

function ClaimRow({
  turf,
  me,
  onDone,
  instant = false,
  pending = false,
  startOpen = false,
  pageHasNumber = false,
}: {
  turf: OwnerTurfRef;
  me: Me;
  onDone: () => void;
  instant?: boolean;
  pending?: boolean;
  startOpen?: boolean;
  /** The turf's page shows Call or WhatsApp (the page's rule): with no mobile a code can go to, that number is a landline or one an owner or a suggestion put there. */
  pageHasNumber?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  // No default: the claimant says whether they are the owner, a manager or staff (a preset Owner told the admin nothing).
  const [role, setRole] = useState<ClaimRole | null>(null);
  const [note, setNote] = useState("");
  const [info, setInfo] = useState<{ mobiles: number; endings: string[] } | null>(null);
  const [step, setStep] = useState<Step>("verify");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [why, setWhy] = useState("");
  const sender = useRef<{ code: ClaimCode; verifier: RecaptchaVerifier | null } | null>(null);
  // A code already proved: a retry after a network blip must not need another SMS.
  const proofRef = useRef<{ proof: string; at: number } | null>(null);
  const [hasProof, setHasProof] = useState(false);
  const keepProof = (p: { proof: string; at: number } | null) => {
    proofRef.current = p;
    setHasProof(!!p);
  };
  const [sentTo, setSentTo] = useState("");
  // Seconds until another code may go to the same number.
  const [resendIn, setResendIn] = useState(0);
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);
  const captchaId = `claim-captcha-${useId().replace(/:/g, "")}`;
  const phoneId = `claim-phone-${useId().replace(/:/g, "")}`;
  const noteId = `claim-note-${useId().replace(/:/g, "")}`;
  // No mobile on the listing: checked by hand, and the turf's number (the one players should call) is asked for;
  // when the page shows a number that can't get a code (a landline), a mobile at the turf instead.
  const byHand = info?.mobiles === 0;
  const listed = byHand && pageHasNumber;

  // What the listing has: no mobile means only a check by hand can help.
  useEffect(() => {
    if (!open || instant || info) return;
    let live = true;
    ownerRpc<ClaimInfo>("owner_claim_info", { p_turf_id: turf.id })
      .then((r) => {
        if (!live) return;
        if ("mobiles" in r) {
          setInfo(r);
          if (r.mobiles === 0) {
            // Nothing to verify with: a waiting claim just waits; a new one goes for a check.
            setStep(pending ? "sent" : "manual");
            setWhy(pageHasNumber ? COPY.byHandWhyListed : COPY.byHandWhy);
          }
        } else setInfo({ mobiles: 0, endings: [] });
      })
      .catch(() => live && setInfo({ mobiles: 1, endings: [] }));
    return () => {
      live = false;
    };
  }, [open, instant, info, turf.id, pending, pageHasNumber]);

  const opened = async () => {
    await refreshTurfPage(turf.id);
    window.location.href = `/my/turf/${turf.id}`;
  };

  const fail = (e?: string) => setMsg((e && CLAIM_ERRORS[e]) || "Something went wrong. Try again.");

  // Phone sign-in whose own number is listed: in at once, no code needed.
  const openInstant = async () => {
    setBusy(true);
    setMsg("");
    try {
      const r = await ownerRpc<ClaimResult>("owner_claim", { p_turf_id: turf.id, p_role: role });
      if (r.status === "active") return void (await opened());
      if (r.status === "pending") {
        setStep("sent");
        onDone();
      } else fail(r.error);
    } catch {
      fail();
    }
    setBusy(false);
  };

  /** A listed number checked by owner_phone_listed: send it the SMS and wait for the code. */
  const startCode = async (p10: string, retryIn?: number) => {
    const sent = await sendClaimCode(p10, captchaId, sender.current?.verifier);
    if ("error" in sent) {
      setMsg(sent.error);
      // No SMS went out: the next try needn't wait 2 minutes (it still counts for the day).
      void ownerRpc("owner_phone_code_failed", { p_turf_id: turf.id, p_phone: p10 }).catch(() => null);
    } else {
      sender.current = sent;
      keepProof(null);
      setSentTo(p10);
      setResendIn(retryIn ?? RESEND_S);
      setCode("");
      setStep("code");
    }
  };

  const sendCode = async () => {
    setMsg("");
    // A claim already waiting keeps the role it was sent with: only a new one asks.
    if (!pending && !role) return setMsg(COPY.roleNeeded);
    const p10 = phone.replace(/\D/g, "").slice(-10);
    if (!/^[6-9]\d{9}$/.test(p10)) return setMsg(CLAIM_ERRORS.bad_phone);
    // Signed in with this very number, and it opens this turf: it proved it already, no code needed.
    if (instant && me.kind === "phone" && p10 === me.who) return void openInstant();
    setBusy(true);
    try {
      const r = await ownerRpc<PhoneListed>("owner_phone_listed", { p_turf_id: turf.id, p_phone: p10 });
      if (r.status === "active") return void (await opened());
      if (r.error) {
        fail(r.error === "too_many" ? undefined : r.error);
        if (r.error === "too_many") setMsg("Too many tries for now. Wait an hour, or send your claim for a check.");
        if (r.error === "wait" && r.retry_in) {
          setSentTo(p10);
          setResendIn(r.retry_in);
        }
        if (r.error === "number_busy") setStep("manual");
      } else if (r.blocked) {
        setWhy(CLAIM_ERRORS.needs_check);
        setStep("manual");
      } else if (!r.listed) {
        setWhy(`+91 ${spaced(p10)} isn't on this listing, so we'll check your claim by hand, usually within a day.`);
        setStep("manual");
      } else {
        await startCode(p10, r.retry_in);
      }
    } catch {
      fail();
    }
    setBusy(false);
  };

  const verify = async () => {
    const s = sender.current;
    const kept = proofRef.current && Date.now() - proofRef.current.at < PROOF_MS ? proofRef.current : null;
    if (!kept && (!s || !/^\d{6}$/.test(code))) return setMsg("Enter the 6-digit code from the SMS.");
    setBusy(true);
    setMsg("");
    let c: { proof: string } | { error: string } = kept ? { proof: kept.proof } : { error: "" };
    if (!kept && s) {
      c = await s.code.confirm(code);
      if ("proof" in c) keepProof({ proof: c.proof, at: Date.now() });
    }
    if ("error" in c) {
      setMsg(c.error);
      setBusy(false);
      return;
    }
    try {
      // A claim already waiting keeps the role and note it was sent with.
      const r = await ownerRpc<ClaimResult>("owner_claim_verified", { p_proof: c.proof, p_turf_id: turf.id, p_note: pending ? null : note || null, p_role: pending ? null : role });
      if (r.status === "active") return void (await opened());
      fail(r.error);
      if (r.error === "bad_code" || r.error === "not_listed") {
        keepProof(null);
        setStep("verify");
      } else if (r.error === "needs_check") {
        keepProof(null);
        setWhy(CLAIM_ERRORS.needs_check);
        setStep("manual");
      }
    } catch {
      // The code still counts for a while: Try again needs no new SMS.
      setMsg("Couldn't reach TapTurf. Your code still counts for a few minutes, so tap Verify and open again.");
    }
    setBusy(false);
  };

  const sendForCheck = async () => {
    setMsg("");
    if (!pending && !role) return setMsg(COPY.roleNeeded);
    // A listing with no mobile: the turf's own number, for our team to call. It is kept where the admin's
    // "Number they gave" reads it (owner_phone_listed records a number that is not on the listing).
    const p10 = byHand ? turfPhone10(phone) : null;
    if (byHand && !p10) return setMsg(listed ? COPY.phoneNeededListed : COPY.phoneNeeded);
    setBusy(true);
    try {
      if (p10) {
        const c = await ownerRpc<PhoneListed>("owner_phone_listed", { p_turf_id: turf.id, p_phone: p10 });
        if (c.status === "active") return void (await opened());
        if (c.error) {
          if (c.error === "too_many") setMsg("Too many tries for now. Wait an hour and try again.");
          else fail(c.error);
          setBusy(false);
          return;
        }
        // On the listing after all (added since this form opened): a code gets them in now.
        if (c.listed) {
          await startCode(p10, c.retry_in);
          setBusy(false);
          return;
        }
      }
      const r = await ownerRpc<ClaimResult>("owner_claim", { p_turf_id: turf.id, p_note: note || null, p_role: role });
      if (r.status === "active") return void (await opened());
      if (r.status === "pending") {
        setStep("sent");
        onDone();
      } else fail(r.error);
    } catch {
      fail();
    }
    setBusy(false);
  };

  const done = step === "sent" || (pending && step !== "code");
  const endings = info?.endings.length ? info.endings.map((e) => `…${e}`).join(" or ") : "";
  const needRole = !role && !done && !pending;

  return (
    <li className="rounded-2xl border border-primary-200 bg-white p-3">
      <div className="flex items-center gap-3">
        <Thumb src={turf.cover} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-primary-900 truncate">{turf.name}</span>
          <span className="block text-[13px] text-primary-500 truncate">{place(turf)}</span>
        </span>
        {step === "sent" ? (
          <span className="text-[13px] text-primary-600 inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-accent-600" /> Sent</span>
        ) : instant ? (
          <button type="button" onClick={() => void openInstant()} disabled={busy} className="h-11 px-4 rounded-full bg-accent-500 hover:bg-accent-600 text-white text-[14px] font-semibold cursor-pointer disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Open"}
          </button>
        ) : !open ? (
          <button type="button" onClick={() => setOpen(true)} className="h-11 px-4 rounded-full bg-primary-100 hover:bg-primary-200 text-primary-900 text-[14px] font-semibold cursor-pointer">
            This is mine
          </button>
        ) : null}
      </div>

      {open && !instant && (
        <div className="mt-3 space-y-3">
          {pending && step !== "code" && step !== "sent" && (
            <p className="rounded-xl bg-primary-50 px-3 py-2 text-[13px] text-primary-700">
              Your claim is with us. We&rsquo;ll confirm it, usually within a day. Have the phone with the listed number? Verify below to get in now.
            </p>
          )}
          {step !== "sent" && (
            <div className="rounded-xl bg-primary-50/60 px-3 py-2 text-[13px] text-primary-700">
              Claiming as <span className="font-semibold text-primary-900">{me.name || "your account"}</span>
              <span className="text-primary-500"> · {me.kind === "email" ? `Google, ${me.who}` : `phone, +91 ${spaced(me.who)}`}</span>
              <span className="block mt-0.5 text-primary-500">
                Once it&rsquo;s yours, the turf&rsquo;s page shows the Claimed badge, and says &ldquo;Managed by @your-username&rdquo; if you have a username. Your number and email never show.
              </span>
            </div>
          )}

          {!done && !pending && (
            <div>
              <p className="text-[14px] font-semibold text-primary-900" id={`${captchaId}-role`}>{COPY.rolePick(turf.name)}</p>
              {/* One row down to 320px: each chip as wide as its word, the rest of the row shared out. */}
              <div className="mt-1.5 flex gap-1.5 max-w-sm" role="radiogroup" aria-labelledby={`${captchaId}-role`}>
                {CLAIM_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={role === r}
                    onClick={() => {
                      setRole(r);
                      setMsg("");
                    }}
                    className={`flex-auto h-11 px-2.5 rounded-full border-2 text-[14px] min-[360px]:text-[15px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${role === r ? "border-primary-900 bg-primary-900 text-white" : "border-primary-200 bg-white text-primary-800 hover:border-primary-400"}`}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
              {needRole && <p className="mt-1.5 text-[13px] text-primary-500">{COPY.roleNeeded}</p>}
            </div>
          )}

          {step === "verify" && (
            <div>
              <p className="font-semibold text-[15px] text-primary-900">Get in now with the turf&rsquo;s number</p>
              <p className="text-[13px] text-primary-600 leading-snug">
                Enter the mobile number on this listing{endings ? ` (it ends ${endings})` : ""}. We&rsquo;ll send it a code.
              </p>
              <div className="mt-2 flex gap-2">
                <span className="inline-flex items-center h-12 px-3 rounded-xl border border-primary-200 bg-primary-50 text-[15px] text-primary-600">+91</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  aria-label="The turf's mobile number"
                  value={phone}
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, "");
                    setPhone(d.length > 10 ? d.slice(-10) : d);
                    setMsg("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && void sendCode()}
                  placeholder="10-digit number"
                  className="min-w-0 flex-1 h-12 px-4 rounded-xl border border-primary-200 text-[16px] focus:outline-none focus:border-primary-400"
                />
              </div>
              <button type="button" onClick={() => void sendCode()} disabled={busy || (!pending && !role) || phone.length !== 10 || (resendIn > 0 && phone === sentTo)} className="mt-2 w-full h-12 rounded-full bg-primary-900 text-white text-[15px] font-semibold cursor-pointer disabled:opacity-50">
                {busy ? "Checking…" : resendIn > 0 && phone === sentTo ? `Send a new code in ${resendIn}s` : "Send code"}
              </button>
              {!pending && (
                <button type="button" onClick={() => { setWhy(""); setMsg(""); setStep("manual"); }} className="mt-2 inline-flex min-h-11 items-center text-[13px] font-semibold text-primary-700 underline underline-offset-2 cursor-pointer">
                  I don&rsquo;t have that phone. Send my claim for a check
                </button>
              )}
            </div>
          )}

          {step === "code" && sentTo && (
            <div>
              <p className="font-semibold text-[15px] text-primary-900">Enter the code</p>
              <p className="text-[13px] text-primary-600">
                We sent a 6-digit code to +91 {spaced(sentTo)}. The SMS says it&rsquo;s for tapturf.firebaseapp.com: that&rsquo;s us.
              </p>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label="6-digit code"
                maxLength={6}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setMsg("");
                }}
                onKeyDown={(e) => e.key === "Enter" && void verify()}
                placeholder="••••••"
                className="mt-2 w-full h-12 px-4 rounded-xl border border-primary-200 text-[20px] tracking-[0.3em] text-center focus:outline-none focus:border-primary-400"
                autoFocus
              />
              <button type="button" onClick={() => void verify()} disabled={busy || (code.length !== 6 && !hasProof)} className="mt-2 w-full h-12 rounded-full bg-accent-500 hover:bg-accent-600 text-white text-[15px] font-semibold cursor-pointer disabled:opacity-50">
                {busy ? "Checking…" : "Verify and open"}
              </button>
              <button type="button" onClick={() => { setStep("verify"); setMsg(""); }} className="mt-2 inline-flex min-h-11 items-center text-[13px] font-semibold text-primary-700 underline underline-offset-2 cursor-pointer">
                Change number or send a new code
              </button>
            </div>
          )}

          {step === "manual" && (
            <div className="space-y-2">
              {why && <p className="text-[13px] text-primary-700 leading-snug">{why}</p>}
              {byHand && (
                <div>
                  <label htmlFor={phoneId} className="block text-[14px] font-semibold text-primary-900">{listed ? COPY.phoneLabelListed : COPY.phoneLabel}</label>
                  <p className="text-[13px] text-primary-500 leading-snug">{listed ? COPY.phoneHintListed : COPY.phoneHint}</p>
                  <div className="mt-1.5 flex gap-2">
                    <span className="inline-flex items-center h-12 px-3 rounded-xl border border-primary-200 bg-primary-50 text-[15px] text-primary-600">+91</span>
                    <input
                      id={phoneId}
                      type="tel"
                      inputMode="numeric"
                      autoComplete="off"
                      required
                      aria-required="true"
                      value={phone}
                      onChange={(e) => {
                        const d = e.target.value.replace(/\D/g, "");
                        setPhone(d.length > 10 ? d.slice(-10) : d);
                        setMsg("");
                      }}
                      placeholder="10-digit number"
                      className="min-w-0 flex-1 h-12 px-4 rounded-xl border border-primary-200 text-[16px] focus:outline-none focus:border-primary-400"
                    />
                  </div>
                </div>
              )}
              <div>
                <label htmlFor={noteId} className="block text-[13px] font-semibold text-primary-700">{COPY.noteLabel}</label>
                <textarea id={noteId} value={note} onChange={(e) => setNote(e.target.value)} placeholder={COPY.notePlaceholder} maxLength={400} rows={2} className="mt-1 w-full px-4 py-2.5 rounded-xl border border-primary-200 text-[16px] focus:outline-none focus:border-primary-400" />
              </div>
              <button type="button" onClick={() => void sendForCheck()} disabled={busy || (!pending && !role) || (byHand && phone.length !== 10)} className="w-full sm:w-auto h-12 px-6 rounded-full bg-primary-900 text-white text-[15px] font-semibold cursor-pointer disabled:opacity-50">
                {busy ? "Sending…" : COPY.sendForCheck}
              </button>
              {info && info.mobiles > 0 && (
                <button type="button" onClick={() => { setMsg(""); setStep("verify"); }} className="flex min-h-11 items-center text-[13px] font-semibold text-primary-700 underline underline-offset-2 cursor-pointer">
                  I have the turf&rsquo;s phone. Verify with a code
                </button>
              )}
            </div>
          )}

          <div id={captchaId} />
        </div>
      )}
      {step === "sent" && (
        <div className="mt-3 rounded-xl bg-accent-50/60 px-3 py-2.5">
          <p className="text-[14px] text-primary-800 leading-snug">{COPY.thanks(turf.name)}</p>
          <p className="mt-0.5 text-[13px] text-primary-500 leading-snug">{COPY.thanksMore}</p>
        </div>
      )}
      {msg && <p className="mt-2 text-[13px] text-hot-600" role="alert">{msg}</p>}
    </li>
  );
}

/** Signed out: what myTapturf is, and one way in. From a claim link the question comes first (ClaimQuestion). */
function Landing({ claimId }: { claimId: string | null }) {
  const claiming = usePublicTurf(claimId);
  const points = [
    { icon: BarChart3, title: "See who finds you", text: "Page views, calls and WhatsApp taps, and how often Ask TapTurf shows your turf, day by day." },
    { icon: Store, title: "Keep your listing right", text: "Update prices, hours, facilities and your WhatsApp number. Changes go live within a minute." },
    { icon: Phone, title: "Free, no app to install", text: "Sign in with Google or your phone. A code to the number on your listing gets you in at once. Players still call you directly." },
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
        <div className="mt-8">
          <TurfCard turf={claiming} label="You run this turf" />
        </div>
      )}
      <Link href={claimId ? claimLoginUrl(claimId) : "/login?next=%2Fmy"} className={`press-tight ${claiming ? "mt-4" : "mt-8"} inline-flex h-12 items-center rounded-full bg-accent-500 hover:bg-accent-600 px-7 text-[16px] font-semibold text-white transition-colors`}>
        {claiming ? "Sign in to manage it" : "Sign in to start"}
      </Link>
      {/* Only where the listing has a number: a page with none is checked by hand. */}
      {claiming?.hasNumber && <p className="mt-2 text-[13px] text-primary-500">Have the phone with the number on this listing? A code to it gets you in straight away.</p>}
      <p className="mt-3 text-[13px] text-primary-500">Questions? Email <a href="mailto:info@tapturf.in" className="underline">info@tapturf.in</a>.</p>
    </Shell>
  );
}
