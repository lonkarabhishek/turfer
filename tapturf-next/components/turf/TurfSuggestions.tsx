"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  History,
  IndianRupee,
  Loader2,
  MessageCircle,
  Pencil,
  Phone,
  PhoneOff,
  ShieldCheck,
  Sparkles,
  Trophy,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { normalizeIndianPhone } from "@/lib/utils/phone";
import {
  getMyTurfSuggestion,
  getTurfSuggestions,
  submitTurfSuggestion,
  type MyTurfSuggestion,
  type SaveResult,
  type SuggestionRelationship,
  type TurfSuggestion,
} from "@/lib/queries/suggestions";

/* ─── Shared open-the-form signal ───────────────────────────
   The notice lives in several places (sidebar, mobile bottom bar,
   inline); the sheet lives once, inside <TurfSuggestions>. They talk
   through a window event so the page stays a server component. */
const OPEN_EVENT = "tapturf:open-suggest";
function openSuggestSheet() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

const SPORT_OPTIONS = [
  "Football",
  "Box Cricket",
  "Cricket",
  "Badminton",
  "Pickleball",
  "Volleyball",
  "Basketball",
  "Tennis",
];

const AMENITY_OPTIONS = [
  "Parking",
  "Washroom",
  "Changing room",
  "Floodlights",
  "Drinking water",
  "Cafeteria",
  "Seating",
  "Equipment on rent",
  "Covered",
];

const RELATIONSHIPS: { id: SuggestionRelationship; label: string }[] = [
  { id: "player", label: "I play here" },
  { id: "owner", label: "I own it" },
  { id: "staff", label: "I work there" },
  { id: "other", label: "Other" },
];

const RELATIONSHIP_LABEL: Record<SuggestionRelationship, string> = {
  player: "Player",
  owner: "Owner",
  staff: "Staff",
  other: "Visitor",
};

/* ─── Small helpers ─────────────────────────────────────── */

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function priceText(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  const lo = min ?? max!;
  const hi = max ?? min!;
  return lo === hi ? inr(lo) : `${inr(lo)} to ${inr(hi)}`;
}

function prettyPhone(raw: string): string {
  const n = normalizeIndianPhone(raw);
  if (!n) return raw;
  return `+91 ${n.local.slice(0, 5)} ${n.local.slice(5)}`;
}

/** Count how many suggestions mention each value, most common first. */
function tally(lists: string[][]): { value: string; count: number }[] {
  const map = new Map<string, { value: string; count: number }>();
  for (const list of lists) {
    for (const raw of new Set(list.map((v) => v.trim()).filter(Boolean))) {
      const key = raw.toLowerCase();
      const hit = map.get(key);
      if (hit) hit.count += 1;
      else map.set(key, { value: raw, count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/* ─── No-contact notice ────────────────────────────────── */

/**
 * Shown wherever Call / WhatsApp would be when a turf has no number.
 * `fixed-bottom` replaces the mobile CTA bar; `card` sits in the
 * desktop sidebar or inline in the page.
 */
export function NoContactNotice({ variant = "card" }: { variant?: "card" | "fixed-bottom" }) {
  if (variant === "fixed-bottom") {
    return (
      <div
        className="fixed bottom-0 left-0 right-0 z-50 material-thick border-t border-primary-200/70 px-4 pt-3 md:hidden animate-slide-up"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center gap-3">
          <p className="flex-1 min-w-0 text-[13px] leading-snug text-primary-500">
            We don&apos;t have this turf&apos;s contact details yet.
          </p>
          <button
            onClick={openSuggestSheet}
            className="shrink-0 h-11 px-5 rounded-full bg-accent-500 active:bg-accent-600 text-white text-[15px] font-semibold"
          >
            I know it
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-primary-50 p-5 text-center">
      <div className="mx-auto mb-3 w-11 h-11 rounded-full bg-white flex items-center justify-center shadow-soft">
        <PhoneOff className="w-5 h-5 text-primary-400" />
      </div>
      <p className="text-[15px] font-semibold text-primary-900 leading-snug">
        Unfortunately, we don&apos;t have the contact details for this turf yet.
      </p>
      <p className="mt-1 text-[14px] text-primary-500 leading-snug">
        If you know them, let us know and help other players book.
      </p>
      <button
        onClick={openSuggestSheet}
        className="mt-4 w-full h-11 rounded-full bg-accent-500 hover:bg-accent-600 text-white text-[15px] font-semibold transition-colors"
      >
        Suggest info for this turf
      </button>
    </div>
  );
}

/* ─── Main section: community info + the form sheet ───── */

export function TurfSuggestions({
  turfId,
  turfName,
  hasPhone,
}: {
  turfId: string;
  turfName: string;
  hasPhone: boolean;
}) {
  const { user, login } = useAuth();
  const [items, setItems] = useState<TurfSuggestion[] | null>(null);
  // The viewer's own suggestion (one per person per turf). When set,
  // "Suggest" becomes "Edit" and the form opens prefilled.
  const [mine, setMine] = useState<MyTurfSuggestion | null>(null);
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const userId = user?.id ?? null;

  const load = useCallback(() => {
    getTurfSuggestions(turfId).then(setItems);
    if (userId) getMyTurfSuggestion(turfId, userId).then(setMine);
  }, [turfId, userId]);

  useEffect(() => {
    let alive = true;
    const req = userId ? getMyTurfSuggestion(turfId, userId) : Promise.resolve(null);
    req.then((row) => {
      if (alive) setMine(row);
    });
    return () => {
      alive = false;
    };
  }, [turfId, userId]);

  useEffect(() => {
    let alive = true;
    getTurfSuggestions(turfId).then((rows) => {
      if (alive) setItems(rows);
    });
    return () => {
      alive = false;
    };
  }, [turfId]);

  // Anyone on the page can ask for the sheet. Signed-out visitors go
  // through the quick login first (same pattern as Call / WhatsApp).
  useEffect(() => {
    const onOpen = () => {
      if (!user) {
        login();
        return;
      }
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [user, login]);

  const summary = useMemo(() => {
    const list = items ?? [];
    const phones = new Map<string, { call: string | null; wa: string | null }>();
    for (const s of list) {
      if (s.contact_phone || s.whatsapp_phone) {
        const key = normalizeIndianPhone(s.contact_phone ?? s.whatsapp_phone)?.local ?? "";
        if (key && !phones.has(key)) phones.set(key, { call: s.contact_phone, wa: s.whatsapp_phone });
      }
    }
    const priced = list.filter((s) => s.price_min != null || s.price_max != null);
    const lows = priced.map((s) => (s.price_min ?? s.price_max) as number);
    const highs = priced.map((s) => (s.price_max ?? s.price_min) as number);
    const hours = tally(list.map((s) => (s.opening_hours ? [s.opening_hours] : [])));
    return {
      phones: [...phones.values()],
      phonePending: list.some((s) => s.phone_pending),
      price: priced.length
        ? { text: priceText(Math.min(...lows), Math.max(...highs))!, count: priced.length }
        : null,
      hours: hours[0] ?? null,
      sports: tally(list.map((s) => s.sports)),
      amenities: tally(list.map((s) => s.amenities)),
    };
  }, [items]);

  // Same rule as the main Call / WhatsApp buttons: quick login first.
  const guard = (e: React.MouseEvent) => {
    if (user) return;
    e.preventDefault();
    login();
  };

  const count = items?.length ?? 0;
  const visible = showAll ? items ?? [] : (items ?? []).slice(0, 3);
  const hasSummary =
    summary.phones.length > 0 ||
    summary.price ||
    summary.hours ||
    summary.sports.length > 0 ||
    summary.amenities.length > 0;

  return (
    <section className="section-divider" aria-labelledby="community-info">
      <div className="flex items-end justify-between gap-4 mb-1">
        <h2 id="community-info" className="text-[22px] font-bold text-primary-900 font-display">
          From players
        </h2>
        {count > 0 && (
          <button
            onClick={openSuggestSheet}
            className="text-[15px] text-accent-600 hover:text-accent-700 shrink-0"
          >
            {mine ? "Edit yours" : "Suggest info"}
          </button>
        )}
      </div>
      <p className="text-[14px] text-primary-500 mb-5">
        Shared by people who know this turf. Not verified by TapTurf.
      </p>

      {items === null ? (
        <div className="h-24 rounded-2xl bg-primary-50 animate-pulse" />
      ) : count === 0 ? (
        hasPhone ? (
          <SuggestRow turfName={turfName} />
        ) : (
          <>
            {/* Desktop already shows the full notice in the sidebar. */}
            <div className="lg:hidden">
              <NoContactNotice />
            </div>
            <div className="hidden lg:block">
              <SuggestRow turfName={turfName} />
            </div>
          </>
        )
      ) : (
        <>
          {/* At-a-glance summary, iOS grouped-list style */}
          {hasSummary && (
            <div className="rounded-2xl bg-primary-50 divide-y divide-primary-200/70 mb-5">
              {summary.phones.map((p, i) => {
                const n = normalizeIndianPhone(p.call ?? p.wa);
                if (!n) return null;
                const waN = p.wa ? normalizeIndianPhone(p.wa) : null;
                return (
                  <SummaryRow
                    key={i}
                    icon={<Phone className="w-4 h-4" />}
                    label="Phone"
                    action={
                      <>
                        {p.call && (
                          <a
                            href={`tel:${n.e164}`}
                            onClick={guard}
                            aria-label="Call"
                            className="w-9 h-9 inline-flex items-center justify-center rounded-full bg-accent-500 text-white"
                          >
                            <Phone className="w-4 h-4" />
                          </a>
                        )}
                        {waN && (
                          <a
                            href={`https://wa.me/${waN.digits}`}
                            onClick={guard}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="WhatsApp"
                            className="w-9 h-9 inline-flex items-center justify-center rounded-full bg-accent-500 text-white"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </a>
                        )}
                      </>
                    }
                  >
                    <span className="tabular-nums">{prettyPhone(n.local)}</span>
                  </SummaryRow>
                );
              })}
              {summary.phones.length === 0 && summary.phonePending && (
                <SummaryRow icon={<Phone className="w-4 h-4" />} label="Phone">
                  <span className="text-primary-500">Shared, being checked</span>
                </SummaryRow>
              )}
              {summary.hours && (
                <SummaryRow icon={<Clock className="w-4 h-4" />} label="Hours">
                  {summary.hours.value}
                  <Count n={summary.hours.count} />
                </SummaryRow>
              )}
              {summary.price && (
                <SummaryRow icon={<IndianRupee className="w-4 h-4" />} label="Price">
                  <span className="tabular-nums">{summary.price.text}</span>
                  <span className="text-primary-500"> / hour</span>
                  <Count n={summary.price.count} />
                </SummaryRow>
              )}
              {summary.sports.length > 0 && (
                <SummaryRow icon={<Trophy className="w-4 h-4" />} label="Sports">
                  {summary.sports.map((s) => s.value).join(", ")}
                </SummaryRow>
              )}
              {summary.amenities.length > 0 && (
                <SummaryRow icon={<Check className="w-4 h-4" />} label="Facilities">
                  {summary.amenities.map((s) => s.value).join(", ")}
                </SummaryRow>
              )}
            </div>
          )}

          {/* Individual contributions */}
          <ul className="space-y-3">
            {visible.map((s) => (
              <SuggestionItem key={s.id} s={s} isMine={mine?.id === s.id} />
            ))}
          </ul>

          {count > 3 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 text-[15px] text-accent-600 hover:text-accent-700"
            >
              {showAll ? "Show less" : `Show all ${count}`}
            </button>
          )}
        </>
      )}

      {open && user && (
        <SuggestSheet
          turfId={turfId}
          turfName={turfName}
          userId={user.id}
          userName={user.name}
          initial={mine}
          askPhoneFirst={!hasPhone}
          onClose={() => setOpen(false)}
          onSubmitted={load}
        />
      )}
    </section>
  );
}

function SuggestRow({ turfName }: { turfName: string }) {
  return (
    <button
      onClick={openSuggestSheet}
      className="w-full flex items-center gap-3 rounded-2xl bg-primary-50 hover:bg-primary-100 px-4 py-4 text-left transition-colors"
    >
      <span className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-soft shrink-0">
        <Sparkles className="w-4 h-4 text-accent-500" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-semibold text-primary-900">
          Know something about {turfName}?
        </span>
        <span className="block text-[13px] text-primary-500">
          Share prices, timings or facilities. Takes a minute.
        </span>
      </span>
      <ChevronRight className="w-5 h-5 text-primary-300 shrink-0" />
    </button>
  );
}

function SummaryRow({
  icon,
  label,
  action,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="w-8 h-8 rounded-lg bg-white text-accent-600 flex items-center justify-center shrink-0 shadow-soft">
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] text-primary-500">{label}</span>
        <span className="block text-[15px] text-primary-900 break-words leading-snug">{children}</span>
      </span>
      {action && <span className="flex items-center gap-2 shrink-0">{action}</span>}
    </div>
  );
}

function Count({ n }: { n: number }) {
  if (n < 2) return null;
  return <span className="text-[13px] text-primary-400"> · {n} players</span>;
}

const CHANGE_LABEL: Record<string, string> = {
  relationship: "Role",
  contact_phone: "Phone",
  whatsapp_phone: "WhatsApp",
  price: "Price",
  price_notes: "Price note",
  opening_hours: "Hours",
  sports: "Sports",
  amenities: "Facilities",
  notes: "Note",
};

function fmtChange(field: string, v: unknown): string {
  if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) return "none";
  if (Array.isArray(v)) return v.join(", ");
  if (field === "contact_phone" || field === "whatsapp_phone") return prettyPhone(String(v));
  if (field === "relationship") return RELATIONSHIP_LABEL[v as SuggestionRelationship] ?? String(v);
  const t = String(v);
  return t.length > 90 ? `${t.slice(0, 90)}…` : t;
}

/** Turn the raw { field: { from, to } } log into display rows. */
function changeRows(s: TurfSuggestion): { label: string; from: string; to: string }[] {
  const c = s.last_changes;
  if (!c) return [];
  const rows: { label: string; from: string; to: string }[] = [];
  const order = ["contact_phone", "whatsapp_phone", "price", "price_notes", "opening_hours", "sports", "amenities", "notes", "relationship"];
  for (const field of order) {
    if (field === "price") {
      if (!c.price_min && !c.price_max) continue;
      const fromMin = (c.price_min ? c.price_min.from : s.price_min) as number | null;
      const fromMax = (c.price_max ? c.price_max.from : s.price_max) as number | null;
      const toMin = (c.price_min ? c.price_min.to : s.price_min) as number | null;
      const toMax = (c.price_max ? c.price_max.to : s.price_max) as number | null;
      rows.push({
        label: CHANGE_LABEL.price,
        from: priceText(fromMin, fromMax) ?? "none",
        to: priceText(toMin, toMax) ?? "none",
      });
      continue;
    }
    const ch = c[field];
    if (!ch) continue;
    rows.push({ label: CHANGE_LABEL[field] ?? field, from: fmtChange(field, ch.from), to: fmtChange(field, ch.to) });
  }
  return rows;
}

function SuggestionItem({ s, isMine }: { s: TurfSuggestion; isMine: boolean }) {
  const [showChanges, setShowChanges] = useState(false);
  const price = priceText(s.price_min, s.price_max);
  const facts: { icon: React.ReactNode; text: string }[] = [];
  if (s.opening_hours) facts.push({ icon: <Clock className="w-3.5 h-3.5" />, text: s.opening_hours });
  if (price) facts.push({ icon: <IndianRupee className="w-3.5 h-3.5" />, text: `${price} / hour` });
  if (s.price_notes) facts.push({ icon: <IndianRupee className="w-3.5 h-3.5" />, text: s.price_notes });
  if (s.contact_phone || s.whatsapp_phone) {
    facts.push({
      icon: <Phone className="w-3.5 h-3.5" />,
      text: prettyPhone((s.contact_phone ?? s.whatsapp_phone)!),
    });
  } else if (s.phone_pending) {
    facts.push({ icon: <Phone className="w-3.5 h-3.5" />, text: "Shared a number (being checked)" });
  }
  const tags = [...s.sports, ...s.amenities];
  const edited = s.edit_count > 0 && s.updated_at;
  const changes = edited ? changeRows(s) : [];

  return (
    <li className={`rounded-2xl border p-4 ${isMine ? "border-accent-200 bg-accent-50/30" : "border-primary-200/80"}`}>
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-full bg-accent-100 text-accent-700 flex items-center justify-center text-[15px] font-semibold shrink-0">
          {s.submitter_name.slice(0, 1).toUpperCase()}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-primary-900 truncate">
            {isMine ? "You" : s.submitter_name}
            {s.relationship !== "player" && (
              <span className="ml-1.5 align-middle inline-flex items-center rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-medium text-primary-600">
                {RELATIONSHIP_LABEL[s.relationship]}
              </span>
            )}
          </p>
          <p className="text-[13px] text-primary-400">
            {edited ? (
              <>Edited {timeAgo(s.updated_at!)}</>
            ) : (
              timeAgo(s.created_at)
            )}
          </p>
        </div>
        {isMine ? (
          <button
            onClick={openSuggestSheet}
            className="h-8 px-3.5 inline-flex items-center gap-1 rounded-full bg-white text-accent-600 text-[13px] font-semibold shadow-soft shrink-0"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
        ) : (
          s.status === "approved" && (
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-accent-600 shrink-0">
              <ShieldCheck className="w-4 h-4" /> Checked
            </span>
          )
        )}
      </div>

      {facts.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {facts.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-[14px] text-primary-800">
              <span className="mt-0.5 text-primary-400">{f.icon}</span>
              <span className="min-w-0 break-words">{f.text}</span>
            </li>
          ))}
        </ul>
      )}

      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t} className="rounded-full bg-primary-100 px-2.5 py-1 text-[12px] text-primary-700">
              {t}
            </span>
          ))}
        </div>
      )}

      {s.notes && (
        <p className="mt-3 text-[14px] leading-relaxed text-primary-700 whitespace-pre-line">
          {s.notes}
        </p>
      )}

      {/* The latest edit, shown openly so readers can see what moved. */}
      {changes.length > 0 && (
        <div className="mt-3 pt-3 border-t border-primary-200/70">
          <button
            onClick={() => setShowChanges((v) => !v)}
            aria-expanded={showChanges}
            className="inline-flex items-center gap-1 text-[13px] text-primary-500 hover:text-primary-800"
          >
            <History className="w-3.5 h-3.5" />
            {showChanges ? "Hide changes" : `What changed (${changes.length})`}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showChanges ? "rotate-180" : ""}`} />
          </button>
          {showChanges && (
            <ul className="mt-2 space-y-2">
              {changes.map((c) => (
                <li key={c.label} className="text-[13px] leading-snug">
                  <span className="block text-primary-500">{c.label}</span>
                  <span className="text-primary-400 line-through decoration-primary-300 break-words">{c.from}</span>
                  <span className="mx-1.5 text-primary-300">→</span>
                  <span className="text-primary-900 break-words">{c.to}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

/* ─── The form ──────────────────────────────────────────── */

function SuggestSheet({
  turfId,
  turfName,
  userId,
  userName,
  initial,
  askPhoneFirst,
  onClose,
  onSubmitted,
}: {
  turfId: string;
  turfName: string;
  userId: string;
  userName: string;
  initial: MyTurfSuggestion | null;
  askPhoneFirst: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  // Editing = the form opens with what they shared last time.
  const isEdit = !!initial;
  const local = (v: string | null | undefined) => (v ? normalizeIndianPhone(v)?.local ?? v : "");
  const [relationship, setRelationship] = useState<SuggestionRelationship>(initial?.relationship ?? "player");
  const [phone, setPhone] = useState(local(initial?.contact_phone));
  const [waSame, setWaSame] = useState(
    !initial || !initial.whatsapp_phone || initial.whatsapp_phone === initial.contact_phone,
  );
  const [wa, setWa] = useState(
    initial?.whatsapp_phone && initial.whatsapp_phone !== initial.contact_phone ? local(initial.whatsapp_phone) : "",
  );
  const [priceMin, setPriceMin] = useState(initial?.price_min != null ? String(initial.price_min) : "");
  const [priceMax, setPriceMax] = useState(initial?.price_max != null ? String(initial.price_max) : "");
  const [priceNotes, setPriceNotes] = useState(initial?.price_notes ?? "");
  const [hours, setHours] = useState(initial?.opening_hours ?? "");
  const [sports, setSports] = useState<string[]>(initial?.sports ?? []);
  const [amenities, setAmenities] = useState<string[]>(initial?.amenities ?? []);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<SaveResult | null>(null);

  // Lock the page behind the sheet; Esc closes.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const submit = async () => {
    setError("");
    const phoneN = phone.trim() ? normalizeIndianPhone(phone) : null;
    if (phone.trim() && !phoneN) {
      setError("That phone number doesn't look right. Use a 10 digit Indian number.");
      return;
    }
    const waRaw = waSame ? phone : wa;
    const waN = waRaw.trim() ? normalizeIndianPhone(waRaw) : null;
    if (!waSame && wa.trim() && !waN) {
      setError("That WhatsApp number doesn't look right.");
      return;
    }
    const lo = priceMin ? Number(priceMin) : null;
    const hi = priceMax ? Number(priceMax) : null;
    for (const p of [lo, hi]) {
      if (p != null && (!Number.isFinite(p) || p < 100 || p > 20000)) {
        setError("Prices should be between ₹100 and ₹20,000 per hour.");
        return;
      }
    }
    const min = lo != null && hi != null ? Math.min(lo, hi) : lo;
    const max = lo != null && hi != null ? Math.max(lo, hi) : hi;

    const anything =
      phoneN || waN || min != null || max != null || priceNotes.trim() || hours.trim() ||
      sports.length || amenities.length || notes.trim();
    if (!anything) {
      setError("Add at least one detail before sending.");
      return;
    }

    setSubmitting(true);
    const res = await submitTurfSuggestion({
      turfId,
      userId,
      submitterName: userName,
      relationship,
      contactPhone: phoneN?.e164 ?? null,
      whatsappPhone: waN?.e164 ?? null,
      priceMin: min,
      priceMax: max,
      priceNotes,
      openingHours: hours,
      sports,
      amenities,
      notes,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(res.result);
    onSubmitted();
  };

  const sheet = (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" data-modal-open="true">
      <div className="absolute inset-0 bg-primary-900/40 animate-fade-in" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Suggest info for ${turfName}`}
        className="relative w-full sm:max-w-lg max-h-[92vh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-elevated animate-slide-up overflow-hidden"
      >
        <div className="sm:hidden flex justify-center pt-2.5">
          <div className="w-10 h-1 bg-primary-300 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <button onClick={onClose} className="text-[17px] text-accent-600 min-w-[64px] text-left">
            {done ? "" : "Cancel"}
          </button>
          <p className="text-[17px] font-semibold text-primary-900">{isEdit ? "Edit your info" : "Suggest info"}</p>
          <button
            onClick={done ? onClose : submit}
            disabled={submitting}
            className="text-[17px] font-semibold text-accent-600 min-w-[64px] text-right disabled:opacity-50"
          >
            {done ? "Done" : submitting ? <Loader2 className="w-5 h-5 animate-spin ml-auto" /> : isEdit ? "Save" : "Send"}
          </button>
        </div>

        {done ? (
          <div className="px-6 pt-8 pb-10 text-center" style={{ paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))" }}>
            <div className="mx-auto w-14 h-14 rounded-full bg-accent-500 text-white flex items-center justify-center">
              <Check className="w-7 h-7" strokeWidth={2.5} />
            </div>
            <p className="mt-4 text-[20px] font-semibold text-primary-900">
              {done === "created" ? "Thank you!" : done === "updated" ? "Updated" : "Nothing changed"}
            </p>
            <p className="mt-1 text-[15px] text-primary-500 max-w-xs mx-auto">
              {done === "created"
                ? "Your info is now on the page. Phone numbers show up after a quick check."
                : done === "updated"
                  ? "Your changes are on the page, marked as edited. A new phone number shows up after a quick check."
                  : "Your info is already up to date."}
            </p>
            <button
              onClick={onClose}
              className="mt-6 h-11 px-8 rounded-full bg-primary-100 text-primary-900 text-[15px] font-semibold"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="overflow-y-auto overscroll-contain px-5 pb-6" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
            <p className="text-[14px] text-primary-500 mb-5">
              {isEdit ? (
                <>
                  You already shared info about <span className="text-primary-900 font-medium">{turfName}</span>.
                  Change anything that&apos;s different now. Other players will see it as edited.
                </>
              ) : (
                <>
                  Help other players with <span className="text-primary-900 font-medium">{turfName}</span>.
                  Fill in only what you know.
                </>
              )}
            </p>

            <Field label="How do you know this turf?">
              <div className="grid grid-cols-2 gap-2">
                {RELATIONSHIPS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRelationship(r.id)}
                    className={`h-10 rounded-xl text-[14px] font-medium transition-colors ${
                      relationship === r.id
                        ? "bg-primary-900 text-white"
                        : "bg-primary-100 text-primary-900 hover:bg-primary-200"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label="Contact number"
              hint={askPhoneFirst ? "The one thing we're missing. Players will call this to book." : undefined}
            >
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder="98765 43210"
                value={phone}
                onChange={setPhone}
              />
              <label className="mt-2 flex items-center gap-2 text-[14px] text-primary-700">
                <input
                  type="checkbox"
                  checked={waSame}
                  onChange={(e) => setWaSame(e.target.checked)}
                  className="w-4 h-4 accent-[#16A34A]"
                />
                Same number on WhatsApp
              </label>
              {!waSame && (
                <div className="mt-2">
                  <Input
                    type="tel"
                    inputMode="tel"
                    placeholder="WhatsApp number (optional)"
                    value={wa}
                    onChange={setWa}
                  />
                </div>
              )}
            </Field>

            <Field label="Price per hour">
              <div className="flex items-center gap-2">
                <Input inputMode="numeric" placeholder="From ₹" value={priceMin} onChange={(v) => setPriceMin(v.replace(/\D/g, ""))} />
                <span className="text-primary-400">to</span>
                <Input inputMode="numeric" placeholder="To ₹" value={priceMax} onChange={(v) => setPriceMax(v.replace(/\D/g, ""))} />
              </div>
              <div className="mt-2">
                <Input
                  placeholder="e.g. ₹800 on weekends, ₹600 weekdays"
                  value={priceNotes}
                  onChange={setPriceNotes}
                  maxLength={200}
                />
              </div>
            </Field>

            <Field label="Opening hours">
              <Input placeholder="e.g. 6 AM to 11 PM, every day" value={hours} onChange={setHours} maxLength={200} />
            </Field>

            <Field label="Sports played here">
              <Chips options={SPORT_OPTIONS} selected={sports} onToggle={(v) => toggle(sports, setSports, v)} />
            </Field>

            <Field label="Facilities">
              <Chips options={AMENITY_OPTIONS} selected={amenities} onToggle={(v) => toggle(amenities, setAmenities, v)} />
            </Field>

            <Field label="Anything else?">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Surface, ground size, best time to go, how to reach…"
                className="w-full rounded-xl bg-primary-100 px-4 py-3 text-[16px] text-primary-900 placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40 resize-none"
              />
            </Field>

            {error && (
              <p className="mb-4 rounded-xl bg-hot-500/10 px-4 py-3 text-[14px] text-hot-600">{error}</p>
            )}

            <button
              onClick={submit}
              disabled={submitting}
              className="w-full h-12 rounded-full bg-accent-500 hover:bg-accent-600 text-white text-[17px] font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="w-5 h-5 animate-spin" />}
              {isEdit ? "Save changes" : "Send suggestion"}
            </button>
            <p className="mt-3 text-center text-[12px] text-primary-400">
              Shared as {userName?.split(" ")[0] || "a player"}. Other players will see this.
            </p>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="text-[15px] font-semibold text-primary-900 mb-1">{label}</p>
      {hint && <p className="text-[13px] text-primary-500 mb-2">{hint}</p>}
      {!hint && <div className="h-1" />}
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-11 rounded-xl bg-primary-100 px-4 text-[16px] text-primary-900 placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
    />
  );
}

function Chips({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            aria-pressed={on}
            className={`h-9 px-3.5 rounded-full text-[14px] transition-colors inline-flex items-center gap-1 ${
              on ? "bg-accent-500 text-white" : "bg-primary-100 text-primary-900 hover:bg-primary-200"
            }`}
          >
            {on && <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
            {o}
          </button>
        );
      })}
    </div>
  );
}
