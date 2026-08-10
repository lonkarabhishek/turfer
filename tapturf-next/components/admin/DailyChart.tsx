import type { DailyPoint } from "@/lib/queries/admin";

/**
 * Zero-dependency SVG bar chart. Renders one bar per day.
 * Designed to fit inside the dashboard grid and stay readable on mobile.
 */
export function DailyChart({
  points,
  color = "#16A34A",
  label,
}: {
  points: DailyPoint[];
  color?: string;
  label: string;
}) {
  if (points.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-sm text-primary-400">
        No data.
      </div>
    );
  }

  const width = 100; // viewBox width — the SVG scales via CSS.
  const height = 40;
  const max = Math.max(1, ...points.map((p) => p.count));
  const barWidth = width / points.length;
  const total = points.reduce((s, p) => s + p.count, 0);

  const first = points[0]?.date;
  const last = points[points.length - 1]?.date;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary-500">
            {label}
          </p>
          <p className="font-display text-3xl text-primary-900 mt-0.5 leading-none">
            {total}
          </p>
        </div>
        <p className="text-xs text-primary-400">
          Peak {max} / day
        </p>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full h-32 md:h-40"
        role="img"
        aria-label={`${label} chart`}
      >
        {points.map((p, i) => {
          const h = (p.count / max) * (height - 2);
          const x = i * barWidth;
          const y = height - h;
          return (
            <g key={p.date}>
              <rect
                x={x + barWidth * 0.1}
                y={y}
                width={barWidth * 0.8}
                height={Math.max(0.3, h)}
                fill={color}
                opacity={p.count === 0 ? 0.15 : 1}
              />
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between mt-2 text-[10px] uppercase tracking-widest text-primary-400 font-semibold">
        <span>{formatShort(first)}</span>
        <span>{formatShort(last)}</span>
      </div>
    </div>
  );
}

function formatShort(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
