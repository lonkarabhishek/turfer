"use client";

import { useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { ownerRpc, refreshTurfPage, type OwnerTurf } from "@/lib/my/client";
import { numberInput, numberKind, numberPatch, saveMessage, shownCallNumber, type NumberField, type SaveError } from "@/lib/my/numbers";
import { formatLabel } from "@/lib/utils/formats";

type Flag = "has_floodlights" | "is_covered" | "parking_available" | "washroom_available" | "changing_room_available" | "has_cafeteria" | "has_drinking_water" | "equipment_provided";
type PriceKey = "morning_price" | "afternoon_price" | "evening_price" | "weekend_morning_price" | "weekend_afternoon_price" | "weekend_evening_price";

const FLAGS: [Flag, string][] = [
  ["has_floodlights", "Floodlights"],
  ["is_covered", "Covered / indoor"],
  ["parking_available", "Parking"],
  ["washroom_available", "Washroom"],
  ["changing_room_available", "Changing room"],
  ["has_drinking_water", "Drinking water"],
  ["has_cafeteria", "Cafe or snacks"],
  ["equipment_provided", "Equipment provided"],
];
const SLOTS: [string, PriceKey, PriceKey][] = [
  ["Morning", "morning_price", "weekend_morning_price"],
  ["Afternoon", "afternoon_price", "weekend_afternoon_price"],
  ["Evening", "evening_price", "weekend_evening_price"],
];
const FORMATS = ["5-a-side", "6-a-side", "7-a-side", "8-a-side", "9-a-side", "11-a-side", "box cricket", "cricket nets", "pickleball", "badminton"];
const SURFACES = ["", "artificial grass", "natural grass", "cement", "wooden", "synthetic", "clay"];

type Form = {
  prices: Record<PriceKey, string>;
  start_time: string;
  end_time: string;
  is_24x7: boolean;
  closed_days: string;
  flags: Record<Flag, boolean | null>;
  formats: string[];
  number_of_grounds: string;
  surface_type: string;
  description: string;
  whatsapp_phone: string;
  /** The number the Call button dials; undefined on an older database, which can't save it. */
  owner_phone?: string;
};

function fromTurf(t: OwnerTurf): Form {
  const p = (n: number | null) => (n != null && n > 0 ? String(n) : "");
  return {
    prices: {
      morning_price: p(t.morning_price),
      afternoon_price: p(t.afternoon_price),
      evening_price: p(t.evening_price),
      weekend_morning_price: p(t.weekend_morning_price),
      weekend_afternoon_price: p(t.weekend_afternoon_price),
      weekend_evening_price: p(t.weekend_evening_price),
    },
    start_time: t.start_time?.slice(0, 5) ?? "",
    end_time: t.end_time?.slice(0, 5) ?? "",
    is_24x7: t.is_24x7 === true,
    closed_days: t.closed_days ?? "",
    flags: Object.fromEntries(FLAGS.map(([k]) => [k, t[k]])) as Record<Flag, boolean | null>,
    formats: t.formats ?? [],
    number_of_grounds: t.number_of_grounds ? String(t.number_of_grounds) : "",
    surface_type: t.surface_type ?? "",
    description: t.description ?? "",
    whatsapp_phone: numberInput(t.whatsapp_phone),
    ...("owner_phone" in t ? { owner_phone: numberInput(shownCallNumber(t)) } : {}),
  };
}

/** Only what changed, in the shape owner_update_turf takes (numbers: numberPatch). */
function diff(a: Form, b: Form): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(b.prices) as PriceKey[]) if (a.prices[k] !== b.prices[k]) out[k] = b.prices[k];
  for (const k of ["start_time", "end_time", "closed_days", "number_of_grounds", "surface_type", "description"] as const)
    if (a[k] !== b[k]) out[k] = b[k];
  if (a.is_24x7 !== b.is_24x7) out.is_24x7 = b.is_24x7;
  for (const [k] of FLAGS) if (a.flags[k] !== b.flags[k]) out[k] = b.flags[k];
  if (a.formats.join("|") !== b.formats.join("|")) out.formats = b.formats;
  return out;
}

const INPUT = "w-full h-11 px-3.5 rounded-xl border border-primary-200 bg-white text-[15px] text-primary-900 focus:outline-none focus:border-primary-400";

export function EditListing({ turf, onSaved }: { turf: OwnerTurf; onSaved: () => void }) {
  const base = useMemo(() => fromTurf(turf), [turf]);
  const [f, setF] = useState<Form>(base);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [msg, setMsg] = useState("");
  // What the last refused save was about: the field to mark, and whether only the numbers were held.
  const [refused, setRefused] = useState<SaveError | null>(null);
  const rest = diff(base, f);
  const numbers = numberPatch(base, f, shownCallNumber(turf));
  const typedNumbers = (["owner_phone", "whatsapp_phone"] as const).filter((k) => f[k] !== undefined && f[k] !== base[k]);
  // A number typed another way is no change; one that isn't a number yet still counts, so Save can say so.
  const count = Object.keys(rest).length + (numbers.error ? typedNumbers.length : Object.keys(numbers.patch).length);
  const dirty = count > 0;

  const fail = (r: SaveError) => {
    setState("error");
    setRefused(r);
    setMsg(saveMessage(r));
  };

  const save = async () => {
    if (numbers.error) return fail(numbers.error);
    setState("saving");
    try {
      const r = await ownerRpc<{ ok?: boolean; error?: string; field?: string }>("owner_update_turf", { p_turf_id: turf.id, p_patch: { ...rest, ...numbers.patch } });
      if (!r.ok) return fail({ error: r.error ?? "unknown", field: r.field });
      await refreshTurfPage(turf.id);
      setState("saved");
      setRefused(null);
      onSaved();
    } catch {
      setState("error");
      setRefused(null);
      setMsg("Couldn't save. Check your connection and try again.");
    }
  };

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setState("idle");
    setRefused(null);
  };
  // Held: put the numbers back as they were, keep the rest of the changes.
  const undoNumbers = () => {
    setF((x) => ({ ...x, whatsapp_phone: base.whatsapp_phone, owner_phone: base.owner_phone }));
    setState("idle");
    setRefused(null);
  };
  const badField: NumberField | null = refused && (refused.error === "bad_value" || refused.error === "held") && (refused.field === "owner_phone" || refused.field === "whatsapp_phone") ? refused.field : null;
  const callKind = f.owner_phone !== undefined ? numberKind(f.owner_phone) : null;

  return (
    <section className="mt-10" id="edit">
      <h2 className="font-display text-[22px] text-primary-900">Edit your listing</h2>
      <p className="mt-1 text-[14px] text-primary-500">What you save here shows on your TapTurf page within a minute.</p>

      <Group title="Prices per hour" hint="Leave blank if you don't want to show a price.">
        {turf.has_listed_bands && !turf.price_owner_confirmed && (
          <p className="mb-3 text-[13px] text-primary-600 rounded-xl bg-primary-50 px-3 py-2">Your page shows prices from your online booking listing. Once you save your own prices here, yours show instead.</p>
        )}
        <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-2 items-center">
          <span />
          <span className="text-[12px] font-semibold text-primary-500">Weekday ₹</span>
          <span className="text-[12px] font-semibold text-primary-500">Weekend ₹</span>
          {SLOTS.map(([label, wd, we]) => (
            <Row key={label} label={label}>
              {[wd, we].map((k) => (
                <input
                  key={k}
                  inputMode="numeric"
                  value={f.prices[k]}
                  onChange={(e) => set("prices", { ...f.prices, [k]: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                  placeholder="–"
                  aria-label={`${label} ${k.startsWith("weekend") ? "weekend" : "weekday"} price`}
                  className={INPUT}
                />
              ))}
            </Row>
          ))}
        </div>
      </Group>

      <Group title="Opening hours">
        <label className="inline-flex items-center gap-2 text-[15px] text-primary-800 cursor-pointer">
          <input type="checkbox" checked={f.is_24x7} onChange={(e) => set("is_24x7", e.target.checked)} className="w-5 h-5 accent-[#16A34A]" />
          Open 24 hours
        </label>
        {!f.is_24x7 && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-[12px] font-semibold text-primary-500">
              Opens
              <input type="time" value={f.start_time} onChange={(e) => set("start_time", e.target.value)} className={`${INPUT} mt-1`} />
            </label>
            <label className="text-[12px] font-semibold text-primary-500">
              Closes
              <input type="time" value={f.end_time} onChange={(e) => set("end_time", e.target.value)} className={`${INPUT} mt-1`} />
            </label>
          </div>
        )}
        <label className="mt-3 block text-[12px] font-semibold text-primary-500">
          Closed on (optional)
          <input value={f.closed_days} onChange={(e) => set("closed_days", e.target.value)} maxLength={60} placeholder="e.g. Monday" className={`${INPUT} mt-1`} />
        </label>
      </Group>

      <Group title="Facilities" hint="Answer what you're sure of; leave the rest on Not sure.">
        <ul className="space-y-2">
          {FLAGS.map(([k, label]) => (
            <li key={k} className="flex items-center justify-between gap-3">
              <span className="text-[15px] text-primary-800">{label}</span>
              <span className="inline-flex rounded-full bg-primary-100 p-0.5" role="radiogroup" aria-label={label}>
                {([[true, "Yes"], [false, "No"], [null, "Not sure"]] as const).map(([v, t]) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={f.flags[k] === v}
                    onClick={() => set("flags", { ...f.flags, [k]: v })}
                    className={`h-8 px-3 rounded-full text-[13px] font-medium cursor-pointer transition-colors ${f.flags[k] === v ? "bg-white text-primary-900 shadow-soft" : "text-primary-600"}`}
                  >
                    {t}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </Group>

      <Group title="About the ground">
        <p className="text-[12px] font-semibold text-primary-500 mb-2">Formats</p>
        <div className="flex flex-wrap gap-2">
          {FORMATS.map((x) => {
            const on = f.formats.includes(x);
            return (
              <button
                key={x}
                type="button"
                aria-pressed={on}
                onClick={() => set("formats", on ? f.formats.filter((y) => y !== x) : [...f.formats, x])}
                className={`h-9 px-3.5 rounded-full text-[13px] font-medium border cursor-pointer transition-colors ${on ? "bg-primary-900 border-primary-900 text-white" : "bg-white border-primary-200 text-primary-800 hover:border-primary-400"}`}
              >
                {formatLabel(x)}
              </button>
            );
          })}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-[12px] font-semibold text-primary-500">
            Number of grounds
            <input inputMode="numeric" value={f.number_of_grounds} onChange={(e) => set("number_of_grounds", e.target.value.replace(/\D/g, "").slice(0, 2))} className={`${INPUT} mt-1`} />
          </label>
          <label className="text-[12px] font-semibold text-primary-500">
            Surface
            <select value={f.surface_type} onChange={(e) => set("surface_type", e.target.value)} className={`${INPUT} mt-1`}>
              {SURFACES.map((s) => (
                <option key={s} value={s}>
                  {s ? s.charAt(0).toUpperCase() + s.slice(1) : "Not set"}
                </option>
              ))}
              {f.surface_type && !SURFACES.includes(f.surface_type) && <option value={f.surface_type}>{f.surface_type}</option>}
            </select>
          </label>
        </div>
        <label className="mt-4 block text-[12px] font-semibold text-primary-500">
          Description
          <textarea
            value={f.description}
            onChange={(e) => set("description", e.target.value)}
            maxLength={1500}
            rows={5}
            placeholder="What makes your turf good to play at: size, surface, lights, parking, what's nearby."
            className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-primary-200 bg-white text-[15px] leading-relaxed text-primary-900 focus:outline-none focus:border-primary-400"
          />
        </label>
      </Group>

      <Group title="Your numbers" hint="Players tap these on your TapTurf page to call or WhatsApp you.">
        {f.owner_phone !== undefined && (
          <div className="mb-4">
            <label htmlFor="call-number" className="block text-[12px] font-semibold text-primary-500">Call number</label>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[15px] text-primary-500">+91</span>
              <input
                id="call-number"
                inputMode="tel"
                autoComplete="tel-national"
                value={f.owner_phone}
                onChange={(e) => set("owner_phone", e.target.value.replace(/[^\d +()-]/g, "").slice(0, 20))}
                placeholder="Mobile or landline"
                aria-invalid={badField === "owner_phone" || undefined}
                aria-describedby="call-number-help"
                className={`${INPUT} ${badField === "owner_phone" ? "border-red-400 focus:border-red-500" : ""}`}
              />
            </div>
            <p id="call-number-help" className="mt-1 text-[12px] text-primary-500">
              {callKind === "landline" ? "Landline: players can call it, but not WhatsApp it." : "A mobile, or a landline with its STD code (like 0253 2350977)."}
            </p>
          </div>
        )}
        <label htmlFor="whatsapp-number" className="block text-[12px] font-semibold text-primary-500">WhatsApp number</label>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[15px] text-primary-500">+91</span>
          <input
            id="whatsapp-number"
            inputMode="tel"
            value={f.whatsapp_phone}
            onChange={(e) => set("whatsapp_phone", e.target.value.replace(/\D/g, "").slice(-10))}
            placeholder="10-digit mobile"
            aria-invalid={badField === "whatsapp_phone" || undefined}
            aria-describedby="whatsapp-number-help"
            className={`${INPUT} ${badField === "whatsapp_phone" ? "border-red-400 focus:border-red-500" : ""}`}
          />
        </div>
        <p id="whatsapp-number-help" className="mt-1 text-[12px] text-primary-500">Leave blank to use your call number, if it&rsquo;s a mobile.</p>
      </Group>

      {/* Sticky save bar while there are unsaved changes. */}
      <div className={`sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4 mt-6 transition-opacity ${dirty || state !== "idle" ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        {/* A refusal gets the full width, with the buttons on their own line under it. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl bg-white border border-primary-200 shadow-elevated px-4 py-3">
          <p className={`min-w-0 text-[14px] text-primary-700 ${state === "error" ? "basis-full" : "flex-1 basis-32"}`} role={state === "error" ? "alert" : undefined}>
            {state === "saved" ? (
              <span className="inline-flex items-center gap-1 text-accent-700 font-semibold"><Check className="w-4 h-4" /> Saved. Live within a minute.</span>
            ) : state === "error" ? (
              <span className="text-red-600">{msg}</span>
            ) : (
              <>{count} unsaved change{count === 1 ? "" : "s"}</>
            )}
          </p>
          <div className="ml-auto flex gap-2 shrink-0">
            {dirty && state !== "saving" && (
              refused?.error === "held" ? (
                <button type="button" onClick={undoNumbers} className="h-10 px-4 rounded-full text-[14px] font-semibold text-primary-600 hover:bg-primary-100 cursor-pointer">
                  Undo number change
                </button>
              ) : (
                <button type="button" onClick={() => { setF(base); setState("idle"); setRefused(null); }} className="h-10 px-4 rounded-full text-[14px] font-semibold text-primary-600 hover:bg-primary-100 cursor-pointer">
                  Undo
                </button>
              )
            )}
            <button type="button" onClick={() => void save()} disabled={!dirty || state === "saving"} className="h-10 px-5 rounded-full bg-primary-900 text-white text-[14px] font-semibold cursor-pointer disabled:opacity-40">
              {state === "saving" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 rounded-2xl border border-primary-200 bg-white p-4 md:p-5">
      <p className="font-semibold text-primary-900">{title}</p>
      {hint && <p className="text-[13px] text-primary-500 mt-0.5">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="text-[14px] text-primary-800 pr-1">{label}</span>
      {children}
    </>
  );
}
