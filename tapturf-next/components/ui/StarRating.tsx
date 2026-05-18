import { Star } from "lucide-react";

export function StarRating({
  rating,
  reviews,
  size = "sm",
}: {
  rating: number;
  reviews?: number;
  size?: "sm" | "md";
}) {
  const iconSize = size === "md" ? "w-4 h-4" : "w-3.5 h-3.5";
  const textSize = size === "md" ? "text-sm" : "text-xs";

  return (
    <div className="flex items-center gap-1 shrink-0">
      <Star className={`${iconSize} fill-accent-500 text-accent-500`} />
      <span className={`${textSize} font-semibold text-primary-700`}>
        {Number(rating).toFixed(1)}
      </span>
      {reviews !== undefined && (
        <span className={`${textSize} text-primary-400`}>({reviews})</span>
      )}
    </div>
  );
}
