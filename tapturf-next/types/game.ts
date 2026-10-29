export interface Game {
  id: string;
  creator_id: string;
  turf_id: string;
  title: string;
  sport: string;
  /** Not a games column (the create flow sends it, the table has no such field). */
  format?: string;
  skill_level: "beginner" | "intermediate" | "advanced" | "all";
  date: string;
  start_time: string;
  end_time: string;
  current_players: number;
  max_players: number;
  price_per_player: number;
  description?: string;
  /** Not a games column: the description is the host's note (hostNote in lib/utils/game.ts). */
  notes?: string;
  /** Not a games column. */
  is_private?: boolean;
  turf_booked: boolean;
  status: "open" | "full" | "in_progress" | "completed" | "cancelled";
  host_name: string;
  /** Left out of every public list (/games cards, turf pages); the game page reads it. */
  host_phone?: string;
  host_profile_image_url?: string;
  created_at: string;
  // Joined data from turfs table
  turfs?: {
    id: string;
    slug?: string | null;
    name: string;
    address: string;
    city?: string | null;
    lat?: number | null;
    lng?: number | null;
    "Gmap Embed link"?: string;
    /** The turf's area ("Baner"), when it has one. */
    area?: string | null;
    /** Its usable photos, best first (usableTurfPhotos): up to 3 on the game page, 2 on a card. */
    photos?: string[];
  };
}

export interface GameRequest {
  id: string;
  game_id: string;
  user_id: string;
  note?: string;
  status: "pending" | "accepted" | "declined";
  requester_name: string;
  requester_phone?: string;
  requester_avatar?: string;
  created_at: string;
}

export interface GameParticipant {
  game_id: string;
  user_id: string;
  joined_at: string;
  name?: string;
  profile_image_url?: string;
}

export interface CreateGameData {
  turfId: string;
  date: string;
  startTime: string;
  endTime: string;
  sport: string;
  format: string;
  skillLevel: "beginner" | "intermediate" | "advanced" | "all";
  maxPlayers: number;
  costPerPerson: number;
  description?: string;
  notes?: string;
  isPrivate?: boolean;
  turfBooked?: boolean;
}
