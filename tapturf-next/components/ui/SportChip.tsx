import Link from "next/link";

const sportConfig: Record<string, { icon: string; label: string }> = {
  football: { icon: "⚽", label: "Football" },
  cricket: { icon: "🏏", label: "Cricket" },
  basketball: { icon: "🏀", label: "Basketball" },
  badminton: { icon: "🏸", label: "Badminton" },
  tennis: { icon: "🎾", label: "Tennis" },
  pickleball: { icon: "🏓", label: "Pickleball" },
};

export function SportChip({
  sport,
  active = false,
}: {
  sport: string;
  active?: boolean;
}) {
  const config = sportConfig[sport] || { icon: "🏟️", label: sport };

  return (
    <Link
      href={`/sport/${sport}`}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
        active
          ? "bg-primary-500 text-white"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
      }`}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </Link>
  );
}

export { sportConfig };
