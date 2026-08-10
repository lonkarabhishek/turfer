export function StatTile({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default" | "accent" | "hot";
}) {
  const bg =
    tone === "accent"
      ? "bg-accent-500 text-white"
      : tone === "hot"
        ? "bg-hot-500 text-white"
        : "bg-white border border-primary-200 text-primary-900";
  const labelColor = tone === "default" ? "text-primary-500" : "text-white/80";
  const subColor = tone === "default" ? "text-primary-500" : "text-white/80";
  return (
    <div className={`rounded-2xl p-5 ${bg}`}>
      <p className={`text-[11px] font-bold uppercase tracking-widest ${labelColor}`}>
        {label}
      </p>
      <p className="font-display text-4xl md:text-5xl mt-1 leading-none">{value}</p>
      {sub && (
        <p className={`text-xs mt-2 font-medium ${subColor}`}>{sub}</p>
      )}
    </div>
  );
}
