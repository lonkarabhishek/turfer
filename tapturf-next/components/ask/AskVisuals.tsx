"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAsk } from "./AskProvider";
import { OwnerMark } from "@/components/turf/OwnerMark";
import { CTAButtons } from "@/components/ui/CTAButtons";
import { areaFor } from "@/lib/utils/area";
import { formatDistance } from "@/lib/utils/location";
import { turfPath, turfUrl } from "@/lib/utils/turfPath";
import { MAP_ASPECT, type CompareTable, type HostPreview, type PriceChart, type ResultsMap } from "@/lib/ask/visuals";
import type { AskResponse } from "./AskProvider";
import type { Turf } from "@/types/turf";

/**
 * The pictures under an Ask answer (lib/ask/cards.ts picks them from the
 * reading and fills them from our rows): a comparison table, each venue's
 * price at the time asked, a map we draw ourselves, and the game about to
 * be hosted. Every value is the server's, from the rows; the names and
 * links come from the answer's own cards. Everything fits a 320px phone,
 * and a wide table scrolls in its own box.
 */

type CardTurf = Turf & { distanceKm?: number };

const pct = (v: number) => `${(Math.min(1, Math.max(0, v)) * 100).toFixed(2)}%`;

function useCards(turfs: readonly CardTurf[]) {
  return useMemo(() => new Map(turfs.map((t) => [t.id, t])), [turfs]);
}

/** Title, a line under it and an optional control on the right; the picture below (as BlogVisual's Figure). */
function Figure({ title, sub, action, children }: { title: string; sub?: string | null; action?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-primary-900 leading-snug">{title}</p>
          {sub && <p className="mt-0.5 text-[12px] text-primary-500 leading-snug">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── Price by time ──────────────────────────────────────────────────

/** The cheapest this many show first; the rest are a tap away (and in the table). */
const FIRST_BARS = 8;

/**
 * One series, so no legend: the title says what is plotted. Bars grow
 * from zero with a rounded end at the price, cheapest first; each row is
 * the venue's link. Venues with no price for the time are named under it
 * with what their price is instead. The table view has every value too.
 */
export function PriceChartView({ chart, turfs }: { chart: PriceChart; turfs: readonly CardTurf[] }) {
  const [table, setTable] = useState(false);
  const [all, setAll] = useState(false);
  const byId = useCards(turfs);
  const bars = chart.bars.filter((b) => byId.has(b.id));
  const off = chart.off.filter((o) => byId.has(o.id));
  if (bars.length < 2) return null;
  const max = Math.max(...bars.map((b) => b.value));
  return (
    <Figure
      title={chart.title}
      sub={chart.note}
      action={
        <button
          type="button"
          onClick={() => setTable((t) => !t)}
          className="-my-2.5 -mr-1.5 h-10 shrink-0 px-1.5 text-[12px] font-semibold text-accent-700 hover:text-accent-800 cursor-pointer transition-colors"
        >
          {table ? "Show as chart" : "Show as table"}
        </button>
      }
    >
      <div className="rounded-2xl border border-primary-100 bg-white px-3.5 py-2.5">
        {table ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-collapse">
              <caption className="sr-only">{`${chart.title}. ${chart.note}`}</caption>
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-primary-400">
                  <th scope="col" className="py-1.5 pr-3 text-left font-semibold">
                    Venue
                  </th>
                  <th scope="col" className="py-1.5 text-right font-semibold">
                    Rate
                  </th>
                </tr>
              </thead>
              <tbody>
                {bars.map((b) => (
                  <tr key={b.id} className="border-t border-primary-100 align-top">
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal text-primary-800">
                      {byId.get(b.id)!.name}
                    </th>
                    <td className="py-1.5 text-right font-semibold tabular-nums text-primary-900 whitespace-nowrap">{b.display}</td>
                  </tr>
                ))}
                {off.map((o) => (
                  <tr key={o.id} className="border-t border-primary-100 align-top">
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal text-primary-800">
                      {byId.get(o.id)!.name}
                    </th>
                    <td className="py-1.5 text-right text-primary-500">{o.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <ol role="list" aria-label={chart.title}>
              {(all ? bars : bars.slice(0, FIRST_BARS)).map((b) => {
                const t = byId.get(b.id)!;
                const w = max > 0 ? b.value / max : 0;
                return (
                  <li key={b.id}>
                    {/* The venue and its price on one line (a long name gives way), its bar under both. */}
                    <Link href={turfPath(t)} aria-label={`${t.name}: ${b.display}`} className="group block py-1.5 cursor-pointer">
                      <span className="flex items-baseline gap-3" aria-hidden>
                        <span className="min-w-0 flex-1 truncate text-[13px] leading-snug text-primary-800 group-hover:text-accent-700 transition-colors">{t.name}</span>
                        <span className="shrink-0 text-[13px] font-semibold tabular-nums text-primary-900">{b.display}</span>
                      </span>
                      <span className="mt-1 block h-2 rounded-r-[4px] bg-primary-100/60" aria-hidden>
                        {/* At least a sliver, so a small price never reads as none. */}
                        <span className="block h-full rounded-r-[4px] bg-accent-500 group-hover:bg-accent-600 transition-colors" style={{ width: `max(2px, ${pct(w)})` }} />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
            {bars.length > FIRST_BARS && (
              <button
                type="button"
                onClick={() => setAll((v) => !v)}
                aria-expanded={all}
                className="mt-0.5 h-9 text-[12px] font-semibold text-accent-700 hover:text-accent-800 cursor-pointer transition-colors"
              >
                {all ? "Show fewer" : `Show ${bars.length - FIRST_BARS} more`}
              </button>
            )}
            {off.length > 0 && (
              <div className="mt-2 border-t border-primary-100 pt-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-400">Not on the chart</p>
                <ul role="list" className="mt-1 space-y-1">
                  {off.map((o) => (
                    <li key={o.id} className="text-[12px] leading-snug">
                      <span className="text-primary-800">{byId.get(o.id)!.name}</span>
                      <span className="text-primary-500"> · {o.why}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Figure>
  );
}

// ── Map ────────────────────────────────────────────────────────────

const kmWords = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km} km`);
const SCALE_AT: Record<string, string> = { bl: "bottom-2 left-2.5", br: "bottom-2 right-2.5", tl: "top-2 left-2.5", tr: "top-2 right-2.5" };

/**
 * Where the venues are, drawn here from their own coordinates: no map
 * tiles and no map service, so nothing loads from anyone (real maps wait
 * for the cookie choice, components/consent/MapPlaceholder.tsx). Each pin
 * is its card's number and opens the venue; the visitor's dot shows when
 * their location is known. Same scale both ways, with a true scale bar.
 */
export function ResultsMapView({ map, turfs }: { map: ResultsMap; turfs: readonly CardTurf[] }) {
  const byId = useCards(turfs);
  const pins = map.pins.filter((p) => byId.has(p.id));
  if (pins.length < 2) return null;
  const left = map.left + (map.pins.length - pins.length);
  return (
    <Figure title="Where they are" sub={map.me ? "You and the venues near you, numbered as the cards." : "The venues by where they are, numbered as the cards."}>
      <div className="relative w-full overflow-hidden rounded-2xl border border-primary-100 bg-[#EEF3F1]" style={{ aspectRatio: String(MAP_ASPECT) }}>
        <svg aria-hidden viewBox="0 0 160 100" className="absolute inset-0 h-full w-full">
          {Array.from({ length: 9 }, (_, i) => (
            <line key={`v${i}`} x1={(i + 1) * 16} y1={0} x2={(i + 1) * 16} y2={100} stroke="#9AA7A1" strokeOpacity={0.22} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {Array.from({ length: 5 }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={(i + 1) * 16.67} x2={160} y2={(i + 1) * 16.67} stroke="#9AA7A1" strokeOpacity={0.22} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {/* Under the pins, in the corner the server found clear of them. */}
        <span aria-hidden className={`pointer-events-none absolute ${SCALE_AT[map.scale.at] ?? SCALE_AT.bl}`} style={{ width: pct(map.scale.w) }}>
          <span className={`block whitespace-nowrap text-[10px] font-semibold leading-none text-primary-600 ${map.scale.at?.endsWith("r") ? "text-right" : ""}`}>{kmWords(map.scale.km)}</span>
          <span className="mt-1 block h-[3px] w-full rounded-full bg-primary-600/70" />
        </span>
        {map.areas.map((a) => (
          <span
            key={a.name}
            aria-hidden
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] font-semibold text-primary-500"
            style={{ left: pct(a.x), top: pct(a.y) }}
          >
            {a.name}
          </span>
        ))}
        {map.me && (
          <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: pct(map.me.x), top: pct(map.me.y) }}>
            <span className="block h-3.5 w-3.5 rounded-full bg-primary-900 ring-[3px] ring-white shadow-soft" />
            <span className="absolute left-full top-1/2 ml-1 -translate-y-1/2 text-[11px] font-semibold text-primary-900">You</span>
          </span>
        )}
        {pins.map((p) => {
          const t = byId.get(p.id)!;
          const area = areaFor(t);
          const away = t.distanceKm != null ? `, ${formatDistance(t.distanceKm)} away` : "";
          return (
            <Link
              key={p.id}
              href={turfPath(t)}
              aria-label={`${p.n}. ${t.name}${area ? `, ${area}` : ""}${away}`}
              className="group absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full cursor-pointer focus-visible:outline-none"
              style={{ left: pct(p.x), top: pct(p.y) }}
            >
              <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-accent-600 text-[12px] font-bold tabular-nums text-white ring-2 ring-white shadow-soft transition-transform group-hover:scale-110 group-focus-visible:ring-primary-900">
                {p.n}
              </span>
              {/* The name on hover and focus; above the pin (under it near the top edge), kept inside the frame at the sides. */}
              <span
                aria-hidden
                className={`pointer-events-none absolute z-10 max-w-[170px] truncate rounded-md bg-primary-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${p.y < 0.3 ? "top-full" : "bottom-full"} ${p.x < 0.25 ? "left-1" : p.x > 0.75 ? "right-1" : "left-1/2 -translate-x-1/2"}`}
              >
                {t.name}
              </span>
            </Link>
          );
        })}
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-snug text-primary-500">
        {map.me && (
          <span className="inline-flex items-center gap-1">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-primary-900" /> You
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-accent-600" /> Venue, by its card&rsquo;s number
        </span>
        <span>Drawn to scale{map.nudged ? ", pins close together moved apart a little" : ""}</span>
        {left > 0 && <span>{left === 1 ? "1 venue isn't" : `${left} venues aren't`} on the map</span>}
      </p>
    </Figure>
  );
}

// ── Comparison ─────────────────────────────────────────────────────

const NOT_LISTED = <span className="text-primary-400">Not listed</span>;
const MAX_SPORTS = 5;

/**
 * The venues side by side, each label over its row so two venues fit a
 * 320px phone without scrolling (three scroll in their own box). Every
 * value is from the venues' rows; the verdict, "best for" and the caveats
 * are the model's words, said as a summary.
 */
export function CompareTableView({ res, table }: { res: AskResponse; table: CompareTable }) {
  const byId = useCards(res.turfs ?? []);
  const venues = table.venues.filter((v) => byId.has(v.id));
  const c = res.compare;
  if (venues.length < 2) return null;
  const n = venues.length;
  const any = (f: (v: (typeof venues)[number]) => unknown) => venues.some((v) => f(v) != null);
  const rows: { label: string; cell: (v: (typeof venues)[number], i: number) => ReactNode }[] = [
    { label: "Price", cell: (v) => (v.price ? <span className="font-semibold text-primary-900">{v.price}</span> : NOT_LISTED) },
    {
      label: "Rating on Google",
      cell: (v) =>
        v.google ? (
          <>
            <span className="font-semibold text-primary-900">{v.google.rating}</span>
            {v.google.reviews && <span className="text-primary-500"> from {v.google.reviews} reviews</span>}
          </>
        ) : (
          NOT_LISTED
        ),
    },
    ...(any((v) => v.players)
      ? [{ label: "TapTurf players", cell: (v: (typeof venues)[number]) => (v.players ? `${v.players.average} from ${v.players.count} player${v.players.count === 1 ? "" : "s"}` : NOT_LISTED) }]
      : []),
    { label: "Hours", cell: (v) => v.hours ?? NOT_LISTED },
    ...(table.distance ? [{ label: "From you", cell: (v: (typeof venues)[number]) => (v.km != null ? `${formatDistance(v.km)} away` : NOT_LISTED) }] : []),
    {
      label: "Sports",
      cell: (v) =>
        v.sports.length ? `${v.sports.slice(0, MAX_SPORTS).join(", ")}${v.sports.length > MAX_SPORTS ? ` and ${v.sports.length - MAX_SPORTS} more` : ""}` : NOT_LISTED,
    },
    { label: "Facilities", cell: (v) => (v.facilities.length ? v.facilities.join(", ") : NOT_LISTED) },
    ...(c?.best_for?.some((b) => b) ? [{ label: "Best for", cell: (_: unknown, i: number) => <span className="font-semibold text-accent-800">{c.best_for[i] || ""}</span> }] : []),
    {
      label: "Contact",
      cell: (v) => {
        const t = byId.get(v.id)!;
        if (!v.contact.phone && !v.contact.whatsapp) return NOT_LISTED;
        return (
          <>
            {v.contact.membersOnly && <span className="mb-1.5 block text-[12px] text-amber-800">Members&apos; club</span>}
            <CTAButtons
              turfId={v.id}
              phone={v.contact.phone}
              whatsappPhone={v.contact.whatsapp}
              turfName={t.name}
              address={v.contact.address}
              variant="compact"
              source="ask_compare"
              pageUrl={turfUrl(t)}
            />
          </>
        );
      },
    },
  ];
  const names = venues.map((v) => byId.get(v.id)!.name);
  return (
    <div>
      {c?.verdict && <p className="text-[15px] text-primary-900 leading-relaxed rounded-2xl bg-accent-50 px-4 py-3 mb-3">{c.verdict}</p>}
      <div className="rounded-2xl border border-primary-100 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-[13px]" style={{ minWidth: n * 128 }}>
            <caption className="sr-only">{`${names.join(" and ")} side by side, from TapTurf's listings`}</caption>
            <thead>
              <tr className="bg-primary-50">
                {venues.map((v, i) => {
                  const t = byId.get(v.id)!;
                  const area = areaFor(t);
                  return (
                    <th key={v.id} id={`cmp-${v.id}`} scope="col" className={`px-3 pt-2.5 pb-2 text-left align-bottom ${i ? "border-l border-primary-100" : ""}`}>
                      <Link href={turfPath(t)} className="font-semibold text-primary-900 leading-snug hover:text-accent-700 cursor-pointer transition-colors">
                        {t.name}
                      </Link>
                      {v.claimed && (
                        <>
                          <OwnerMark size={14} className="ml-1 inline-block align-[-2px]" />
                          <span className="sr-only">, claimed by its owner</span>
                        </>
                      )}
                      {area && <span className="mt-0.5 block text-[12px] font-normal text-primary-500 truncate">{area}</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            {rows.map((row, r) => (
              <tbody key={row.label}>
                <tr>
                  <th id={`cmp-row-${r}-${venues[0].id}`} colSpan={n} scope="colgroup" className="border-t border-primary-100 px-3 pt-2.5 pb-1 text-left text-[11px] font-semibold uppercase tracking-wide text-primary-400">
                    {row.label}
                  </th>
                </tr>
                <tr className="align-top">
                  {venues.map((v, i) => (
                    <td key={v.id} headers={`cmp-${v.id} cmp-row-${r}-${venues[0].id}`} className={`px-3 pb-2.5 leading-snug text-primary-800 break-words ${i ? "border-l border-primary-100" : ""}`}>
                      {row.cell(v, i)}
                    </td>
                  ))}
                </tr>
              </tbody>
            ))}
          </table>
        </div>
        {c?.caveats && <p className="px-3 py-2 text-[11px] text-primary-400 border-t border-primary-100">{c.caveats}</p>}
      </div>
    </div>
  );
}

// ── Host this game ─────────────────────────────────────────────────

/**
 * What the reading says of the game, each line only when it was said, and
 * the wizard drafted from the sentence (its own reading fills the form).
 * Nothing read: the sentence itself, as the form will read it.
 */
export function HostCardView({ host, draft }: { host: HostPreview; draft?: string }) {
  const { closePanel } = useAsk();
  return (
    <div className="rounded-2xl border border-primary-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-400">Your game</p>
      {host.lines.length > 0 || host.turf ? (
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[14px] leading-snug">
          {host.lines.map((l) => (
            <div key={l.label} className="contents">
              <dt className="text-primary-500">{l.label}</dt>
              <dd className="font-semibold text-primary-900">{l.value}</dd>
            </div>
          ))}
          {host.turf && (
            <div className="contents">
              <dt className="text-primary-500">Turf</dt>
              <dd className="min-w-0">
                <Link href={turfPath({ id: host.turf.id, slug: host.turf.slug })} onClick={closePanel} className="font-semibold text-primary-900 hover:text-accent-700 cursor-pointer transition-colors">
                  {host.turf.name}
                </Link>
                {host.turf.place && <span className="block text-[12px] text-primary-500">{host.turf.place}</span>}
              </dd>
            </div>
          )}
        </dl>
      ) : (
        draft && <p className="mt-1.5 text-[14px] font-semibold text-primary-900 leading-snug break-words">&ldquo;{draft}&rdquo;</p>
      )}
      <p className="mt-3 text-[12px] text-primary-500 leading-snug">The form fills in from your message. Check each step before the game goes live.</p>
      <Link
        href={host.href}
        onClick={closePanel}
        className="mt-3 flex items-center justify-center gap-2 h-11 px-5 rounded-full bg-accent-500 hover:bg-accent-600 text-white text-[14px] font-semibold transition-colors"
      >
        Set up this game <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
