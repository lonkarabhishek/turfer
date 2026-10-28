import { ChevronDown } from "lucide-react";

/**
 * A long list behind one tap: a closed <details> whose bar shows the
 * heading (and an optional line under it). The links inside stay in the
 * server HTML, so crawlers read and follow them as before; only people
 * see less until they open it. Same look as the A to Z turf index.
 *
 * `id` sits on the wrapper, not the <details>, so an old #anchor still
 * lands here, and browsers that open a closed <details> around a linked
 * fragment can do so.
 */
export function Fold({
  id,
  title,
  sub,
  className = "",
  children,
}: {
  id?: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={className} style={id ? { scrollMarginTop: "4.5rem" } : undefined}>
      <details className="group">
        <summary className="cursor-pointer list-none flex items-center justify-between gap-3 rounded-2xl bg-primary-50 hover:bg-primary-100 px-5 py-4 [&::-webkit-details-marker]:hidden focus-neon">
          <span className="min-w-0">
            <h2 className="text-[17px] font-semibold text-primary-900">{title}</h2>
            {sub && <span className="block mt-0.5 text-[13px] text-primary-500">{sub}</span>}
          </span>
          <ChevronDown className="w-5 h-5 shrink-0 text-primary-500 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="mt-4 px-1">{children}</div>
      </details>
    </section>
  );
}
