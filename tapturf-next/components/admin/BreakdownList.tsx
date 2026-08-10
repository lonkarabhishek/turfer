import type { CountByLabel } from "@/lib/queries/admin";

/**
 * Horizontal bar breakdown for small categorical distributions.
 * Renders label + count + a proportional bar.
 */
export function BreakdownList({
  title,
  items,
  color = "#16A34A",
  emptyMessage = "No data yet.",
}: {
  title: string;
  items: CountByLabel[];
  color?: string;
  emptyMessage?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  const total = items.reduce((s, i) => s + i.count, 0);

  return (
    <div className="rounded-2xl bg-white border border-primary-200 p-5">
      <div className="flex items-baseline justify-between mb-4">
        <p className="text-xs font-bold uppercase tracking-widest text-primary-500">
          {title}
        </p>
        <p className="text-xs text-primary-400">{total} total</p>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-primary-400 py-3">{emptyMessage}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((i) => (
            <li key={i.label}>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="capitalize text-primary-800 font-medium">
                  {i.label}
                </span>
                <span className="font-mono text-primary-700">{i.count}</span>
              </div>
              <div className="h-1.5 rounded-full bg-primary-100 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, (i.count / max) * 100)}%`,
                    background: color,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
