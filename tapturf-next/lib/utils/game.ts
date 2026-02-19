import type { Game } from "@/types/game";

export function isGameExpired(game: Pick<Game, "date" | "start_time">): boolean {
  try {
    const gameDate = new Date(game.date);
    if (isNaN(gameDate.getTime())) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    gameDate.setHours(0, 0, 0, 0);

    if (gameDate < today) return true;

    if (gameDate.getTime() === today.getTime() && game.start_time) {
      const [hours, minutes] = game.start_time.split(":").map(Number);
      if (!isNaN(hours) && !isNaN(minutes)) {
        const gameDateTime = new Date();
        gameDateTime.setHours(hours, minutes, 0, 0);

        // 30-minute buffer
        const buffer = new Date();
        buffer.setMinutes(buffer.getMinutes() - 30);
        return gameDateTime < buffer;
      }
    }

    return false;
  } catch {
    return false;
  }
}

export function filterNonExpiredGames<T extends Pick<Game, "date" | "start_time">>(games: T[]): T[] {
  return games.filter((g) => !isGameExpired(g));
}

export function sortGamesByDateTime<T extends Pick<Game, "date" | "start_time">>(games: T[]): T[] {
  return [...games].sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    if (dateA !== dateB) return dateA - dateB;

    const timeValue = (g: T) => {
      const [h, m] = (g.start_time || "00:00").split(":").map(Number);
      return h * 60 + m;
    };
    return timeValue(a) - timeValue(b);
  });
}

export function getGameStatus(game: Pick<Game, "date" | "start_time" | "end_time">): "upcoming" | "live" | "expired" {
  const gameDate = new Date(game.date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  gameDate.setHours(0, 0, 0, 0);

  if (gameDate < today) return "expired";

  if (gameDate.getTime() === today.getTime()) {
    const now = new Date();
    const [sh, sm] = (game.start_time || "00:00").split(":").map(Number);
    const [eh, em] = (game.end_time || `${sh + 1}:${String(sm).padStart(2, "0")}`).split(":").map(Number);

    const start = new Date();
    start.setHours(sh, sm, 0, 0);
    const end = new Date();
    end.setHours(eh, em, 0, 0);

    if (now >= start && now <= end) return "live";
    if (now > end) return "expired";
  }

  return "upcoming";
}

export function formatDate(dateStr: string): string {
  const today = new Date();
  const gameDate = new Date(dateStr);
  today.setHours(0, 0, 0, 0);
  gameDate.setHours(0, 0, 0, 0);

  const diffDays = Math.round((gameDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";

  if (diffDays < 7 && diffDays > 0) {
    const weekday = gameDate.toLocaleDateString("en-US", { weekday: "short" });
    const day = gameDate.getDate();
    const month = gameDate.toLocaleDateString("en-US", { month: "short" });
    return `${weekday}, ${day} ${month}`;
  }

  const day = gameDate.getDate();
  const month = gameDate.toLocaleDateString("en-US", { month: "short" });
  const year = gameDate.getFullYear();
  return `${day} ${month} ${year}`;
}

function formatTime(timeStr: string): string {
  if (!timeStr || timeStr === "00:00") return "12:00 AM";
  const [hours, minutes] = timeStr.split(":");
  const h24 = parseInt(hours, 10);
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  const ampm = h24 < 12 ? "AM" : "PM";
  return `${h12}:${minutes} ${ampm}`;
}

export function formatTimeSlot(startTime: string, endTime: string): string {
  return `${formatTime(startTime)}\u2013${formatTime(endTime)}`;
}

export function capitalizeSkillLevel(level: string | null | undefined): string {
  if (!level) return "All levels";
  const map: Record<string, string> = {
    beginner: "Beginner",
    intermediate: "Intermediate",
    advanced: "Advanced",
    all: "All levels",
  };
  return map[level.toLowerCase()] || "All levels";
}
