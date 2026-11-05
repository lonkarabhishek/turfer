import { labelFor, isCity } from "@/lib/city";
import { istDate } from "@/lib/turfPage/owner";
import { turfCheck } from "@/lib/turfPage/noContact";
import {
  MID_TURF,
  benchmarkOf,
  benchmarkText,
  benchmarksNote,
  groundSentenceParts,
  middleTurf,
  sizeWord,
  sportsFor,
  suitability,
  type Benchmark,
  type PeerTurf,
} from "@/lib/turfSize/benchmark";
import { SPORT_LABEL, fromFeet, groundTitle, shown, type Dim, type Ground, type GroundSizes } from "@/lib/turfSize/sizes";
import { SideView, SizeMeter, SuitChips, TopView } from "./GroundDiagrams";

const DIMS: [Dim, string][] = [
  ["length", "Length"],
  ["width", "Width"],
  ["height", "Net height"],
];
const cityName = (id: string) => (isCity(id) ? labelFor(id) : id);

/**
 * "Ground size" on a turf page: each ground its owner described on
 * myTapturf, in feet and metres, drawn from above to scale (against a
 * typical turf) and from the side (its nets against a 6 ft player), in
 * size words, against other turfs once enough have sizes, and what it
 * suits (lib/turfSize/benchmark.ts). Server-rendered; nothing for a turf
 * without sizes. Each ground leads with one plain sentence of its size and
 * what it suits, the text crawlers read (the turf's JSON-LD amenityFeature
 * carries the same). `peers`: the other turfs' sizes (lib/queries/groundSizes.ts).
 */
export function GroundSize({
  turf,
  sizes,
  peers,
  renderedAt,
  hasContact = true,
}: {
  turf: { id: string; city: string | null; sports: string[] };
  sizes: GroundSizes;
  peers: readonly PeerTurf[];
  renderedAt: number;
  /** False on a page with no number: the note says to check at the turf, not with it. */
  hasContact?: boolean;
}) {
  const grounds = sizes.grounds;
  const frame = { length: Math.max(...grounds.map((g) => g.length_ft)), width: Math.max(...grounds.map((g) => g.width_ft)) };
  const marks = grounds.map((g) => benchmarkOf(g, turf, peers));
  // The note under the card: whom every comparison shown is with (each size picks its own turfs).
  const note = benchmarksNote(marks.flatMap((m) => [m.length, m.width, m.height]).filter((b): b is Benchmark => !!b), cityName);
  // The dashed outline: the middle turf of those the lengths compare with.
  const byLength = marks.find((m) => m.length)?.length;
  const middle = middleTurf(turf, peers, byLength);
  const refSize = middle ?? MID_TURF;
  const refLabel = middle && byLength ? (byLength.place === "city" && byLength.city ? `the middle turf in ${cityName(byLength.city)}` : "the middle turf across India") : "a mid-size turf";
  const date = istDate(sizes.updated_at, renderedAt);
  const unit = sizes.unit;

  return (
    <section className="section-divider" aria-labelledby="ground-size">
      <h2 id="ground-size" className="text-[22px] font-bold text-primary-800 font-serif">
        Ground size
      </h2>
      <p className="mt-1 mb-5 text-[13px] text-primary-500">
        Owner-reported{date ? `, ${date}` : ""}. Measured inside the nets.
      </p>
      <div className="space-y-4">
        {grounds.map((g, i) => (
          <GroundCard
            key={i}
            ground={g}
            title={groundTitle(g, i, grounds.length)}
            index={i}
            count={grounds.length}
            unit={unit}
            bench={marks[i]}
            frame={frame}
            refSize={refSize}
            refLabel={refLabel}
            sports={turf.sports}
          />
        ))}
      </div>
      <p className="mt-3 text-[12px] text-primary-400 leading-snug">
        Drawn to scale from above (dashed: {refLabel}, {shown(refSize.length)} × {shown(refSize.width)} ft) and from the side, against a 6 ft player.{" "}
        {note ? `${note} ` : ""}{`A guide from the sizes; ${turfCheck(hasContact)}.`}
      </p>
    </section>
  );
}

function GroundCard({
  ground: g,
  title,
  index,
  count,
  unit,
  bench,
  frame,
  refSize,
  refLabel,
  sports,
}: {
  ground: Ground;
  title: string;
  index: number;
  count: number;
  unit: GroundSizes["unit"];
  bench: Partial<Record<Dim, Benchmark>>;
  frame: { length: number; width: number };
  refSize: { length: number; width: number };
  refLabel: string;
  sports: string[];
}) {
  const which = sportsFor(g, sports);
  const s = suitability(g, which);
  // One plain sentence (the JSON-LD's amenityFeature says the same): it reads as sentenceText, no markers between the pieces.
  const line = groundSentenceParts(g, index, count, unit, which);
  return (
    <article className="rounded-2xl border border-cream-300 p-4 sm:p-5">
      <h3 className="text-[17px] font-semibold text-primary-800">
        {title}
        {g.sport && (
          <>
            {" "}
            <span className="ml-1 align-middle rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] text-primary-600">{SPORT_LABEL[g.sport]}</span>
          </>
        )}
      </h3>
      <p className="mt-1 text-[15px] text-primary-700 leading-snug">
        {`${line.subject} is `}
        <strong className="font-semibold text-primary-800 tabular-nums">{line.size}</strong> <span className="text-primary-400 tabular-nums">{line.other}</span>
        {line.rest}
      </p>

      <div className="mt-4 grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3 items-end max-w-md">
        <TopView ground={g} refSize={refSize} refLabel={refLabel} frame={frame} marks={which.cricket ? "pitch" : which.football ? "football" : "none"} />
        {g.height_ft != null ? <SideView heightFt={g.height_ft} /> : <p className="text-[12px] text-primary-500">Open ground: no net height given</p>}
      </div>

      <dl className="mt-4 divide-y divide-cream-200 rounded-xl border border-cream-300 text-[13px]">
        {DIMS.map(([dim, label]) => {
          const v = dim === "length" ? g.length_ft : dim === "width" ? g.width_ft : g.height_ft;
          if (v == null) return null;
          const b = bench[dim];
          return (
            <div key={dim} className="grid grid-cols-[1fr_auto] gap-x-3 px-3 py-2.5">
              <dt className="font-semibold text-primary-500">{label}</dt>
              <dd className="font-semibold text-primary-800 tabular-nums">{`${shown(fromFeet(v, unit))} ${unit} · ${sizeWord(dim, v)}`}</dd>
              <dd className="col-span-2 mt-2">
                <SizeMeter dim={dim} valueFt={v} />
              </dd>
              {b && <dd className="col-span-2 mt-1.5 text-primary-600">{benchmarkText(dim, b, cityName)}</dd>}
            </div>
          );
        })}
      </dl>

      <SuitChips chips={s.chips} className="mt-4" />
      {s.reasons.length > 0 && (
        <ul className="mt-3 space-y-1 text-[14px] text-primary-600 leading-snug list-disc pl-5 marker:text-primary-300">
          {s.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </article>
  );
}
