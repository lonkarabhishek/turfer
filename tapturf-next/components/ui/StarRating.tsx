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
    <div className="flex items-center gap-1">
      <Star className={`${iconSize} fill-gray-900 text-gray-900`} />
      <span className={`${textSize} font-semibold text-gray-900`}>
        {Number(rating).toFixed(1)}
      </span>
      {reviews !== undefined && (
        <span className={`${textSize} text-gray-500`}>({reviews})</span>
      )}
    </div>
  );
}
