import Link from "next/link";
import {
  Dumbbell,
  Target,
  CircleDot,
  Feather,
  Circle,
  Grip,
} from "lucide-react";

const sportConfig: Record<
  string,
  { icon: React.ReactNode; label: string }
> = {
  football: {
    icon: <CircleDot className="w-4 h-4" />,
    label: "Football",
  },
  cricket: {
    icon: <Target className="w-4 h-4" />,
    label: "Cricket",
  },
  basketball: {
    icon: <Circle className="w-4 h-4" />,
    label: "Basketball",
  },
  badminton: {
    icon: <Feather className="w-4 h-4" />,
    label: "Badminton",
  },
  tennis: {
    icon: <Grip className="w-4 h-4" />,
    label: "Tennis",
  },
  pickleball: {
    icon: <Dumbbell className="w-4 h-4" />,
    label: "Pickleball",
  },
};

const sportEmoji: Record<string, string> = {
  football: "⚽",
  cricket: "🏏",
  basketball: "🏀",
  badminton: "🏸",
  tennis: "🎾",
  pickleball: "🏓",
};

export function SportChip({
  sport,
  active = false,
}: {
  sport: string;
  active?: boolean;
}) {
  const config = sportConfig[sport] || {
    icon: <CircleDot className="w-4 h-4" />,
    label: sport,
  };

  return (
    <Link
      href={`/sport/${sport}`}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap border cursor-pointer min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 ${
        active
          ? "bg-primary-600 text-white border-primary-600 shadow-soft"
          : "bg-white text-primary-700 border-cream-300 hover:border-primary-300 hover:bg-primary-50 hover:shadow-soft"
      }`}
    >
      {config.icon}
      <span>{config.label}</span>
    </Link>
  );
}

export { sportConfig, sportEmoji };
