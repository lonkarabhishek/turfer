import { PITCH_FT, meterPos, sideView, topView, type Chip, type Tone } from "@/lib/turfSize/benchmark";
import { fromFeet, shown, type Dim, type Ground } from "@/lib/turfSize/sizes";

// The Ground size drawings and pieces: the turf page's card
// (components/turf/GroundSize.tsx) renders them on the server, the owner's
// form on myTapturf (components/my/GroundSizes.tsx) as a live preview. No
// hooks and no state, so both can. The drawings carry no text of their own
// (it would scale with them): each has a text equivalent (aria-label) and
// the numbers sit next to it in the page. Kept small: a server-rendered
// turf page carries this markup twice (its HTML and its RSC payload), so
// lines are joined into single paths and numbers kept to one decimal.

const ft = (x: number) => `${shown(x)} feet`;
const r1 = (x: number) => Math.round(x * 10) / 10;

/** Top view, to scale: the ground, a pitch strip (cricket) or a halfway line (football only), and a dashed reference turf. */
export function TopView({
  ground,
  refSize,
  refLabel,
  frame,
  marks,
}: {
  ground: Ground;
  refSize: { length: number; width: number };
  /** "a mid-size turf" or "the middle turf in Nashik", for the text equivalent. */
  refLabel: string;
  frame?: { length: number; width: number } | null;
  marks: "pitch" | "football" | "none";
}) {
  const t = topView(ground, refSize, frame ?? null);
  const { ground: g, pitch: p, ref } = t;
  const label = `Top view, to scale: ${ft(ground.length_ft)} long and ${ft(ground.width_ft)} wide, drawn over ${refLabel} (${shown(refSize.length)} by ${shown(refSize.width)} feet, dashed).`;
  // The creases, 4 ft in from each end of the pitch.
  const crease = r1(4 * t.s);
  return (
    <svg viewBox={`0 0 ${t.w} ${t.h}`} role="img" aria-label={label} className="block w-full h-auto">
      <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={4} className="fill-accent-100 stroke-accent-600" strokeWidth={2} />
      {marks === "pitch" && (
        <>
          <rect x={p.x} y={p.y} width={p.w} height={p.h} className="fill-amber-100 stroke-amber-400" />
          <path d={`M${r1(p.x + crease)} ${r1(p.y - 2)}v${r1(p.h + 4)}M${r1(p.x + p.w - crease)} ${r1(p.y - 2)}v${r1(p.h + 4)}`} className="stroke-amber-500" />
        </>
      )}
      {marks === "football" && (
        <path
          d={`M${r1(t.w / 2)} ${g.y}v${g.h}`}
          className="stroke-accent-600"
          strokeWidth={1.5}
        />
      )}
      {marks === "football" && <circle cx={r1(t.w / 2)} cy={r1(t.h / 2)} r={r1(Math.min(g.h * 0.18, PITCH_FT.length * t.s * 0.25))} className="fill-none stroke-accent-600" strokeWidth={1.5} />}
      <rect x={ref.x} y={ref.y} width={ref.w} height={ref.h} rx={4} className="fill-none stroke-primary-400" strokeWidth={1.5} strokeDasharray="6 5" />
    </svg>
  );
}

/** Side view: the net height against a 6 ft player, with a tick every 10 ft. */
export function SideView({ heightFt }: { heightFt: number }) {
  const v = sideView(heightFt);
  const p = v.player;
  const right = v.w - 8;
  const mesh = Array.from({ length: 9 }, (_, i) => `M${r1(14 + ((right - 14) * (i + 1)) / 10)} ${v.netTop}V${v.base}`).join("");
  const ticks = Array.from({ length: Math.floor(heightFt / 10) }, (_, i) => `M6 ${r1(v.base - (i + 1) * 10 * v.s)}h8`).join("");
  // A 6 ft player standing at x 30: head, then body and legs as one shape.
  const head = r1(p * 0.09);
  const body = `M${r1(30 - p * 0.12)} ${r1(v.base - p * 0.8)}h${r1(p * 0.24)}v${r1(p * 0.38)}h${r1(-p * 0.04)}v${r1(p * 0.42)}h${r1(-p * 0.06)}v${r1(-p * 0.42)}h${r1(-p * 0.04)}v${r1(p * 0.42)}h${r1(-p * 0.06)}v${r1(-p * 0.42)}h${r1(-p * 0.04)}z`;
  const label = `Side view: nets ${ft(heightFt)} (${shown(fromFeet(heightFt, "m"))} metres) high, about ${v.players} times a 6 foot player.`;
  return (
    <svg viewBox={`0 0 ${v.w} ${v.h}`} role="img" aria-label={label} className="block w-full h-auto">
      <rect x={14} y={v.netTop} width={right - 14} height={r1(v.base - v.netTop)} className="fill-accent-50" />
      <path d={mesh} className="stroke-accent-200" />
      <path d={`M14 ${v.base}V${v.netTop}H${right}V${v.base}`} className="fill-none stroke-accent-700" strokeWidth={2} />
      {ticks && <path d={ticks} className="stroke-primary-300" />}
      <circle cx={30} cy={r1(v.base - p + head)} r={head} className="fill-primary-800" />
      <path d={body} className="fill-primary-800" />
      <path d={`M4 ${v.base}H${v.w - 2}`} className="stroke-primary-400" strokeWidth={1.5} />
    </svg>
  );
}

// The meter's three parts as one bar: done, this one, to come.
const PART = { done: "#BBF7D0", here: "#16A34A", rest: "#E5E7EB" } as const;

/** Where a size sits among the three bands: one bar in three parts, and a dot. Decorative: the word and numbers are the text. */
export function SizeMeter({ dim, valueFt }: { dim: Dim; valueFt: number }) {
  const pos = meterPos(dim, valueFt);
  const part = Math.min(2, Math.floor(pos * 3));
  const c = [0, 1, 2].map((i) => (i === part ? PART.here : i < part ? PART.done : PART.rest));
  return (
    <span
      aria-hidden
      className="relative block h-1.5 w-full rounded-full"
      style={{ background: `linear-gradient(90deg,${c[0]} 32.6%,#0000 0 33.7%,${c[1]} 0 66.3%,#0000 0 67.4%,${c[2]} 0)` }}
    >
      <span className="absolute top-1/2 size-3 -translate-1/2 rounded-full border-2 border-white bg-accent-700" style={{ left: `${r1(pos * 100)}%` }} />
    </span>
  );
}

const TONE: Record<Tone, string> = {
  great: "bg-accent-600 text-white border-accent-600",
  good: "bg-accent-50 text-accent-800 border-accent-200",
  ok: "bg-primary-50 text-primary-700 border-primary-200",
  poor: "bg-amber-50 text-amber-900 border-amber-200",
};

export function SuitChips({ chips, className = "" }: { chips: Chip[]; className?: string }) {
  if (chips.length === 0) return null;
  return (
    <ul className={`flex flex-wrap gap-1.5 text-[12px] font-semibold leading-tight ${className}`}>
      {chips.map((c) => (
        <li key={c.id} className={`rounded-full border px-3 py-1 ${TONE[c.tone]}`}>
          {c.text}
        </li>
      ))}
    </ul>
  );
}
