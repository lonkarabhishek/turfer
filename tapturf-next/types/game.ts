export interface Game {
  id: string;
  creator_id: string;
  /** Null for a game at a venue its host typed (not on TapTurf): then venue_name and the rest say where (lib/utils/game.ts gameVenue). */
  turf_id: string | null;
  /**
   * A venue not on TapTurf, as its host typed it (20261103_game_other_venue.sql):
   * absent before that file, null for a game at a TapTurf turf.
   */
  venue_name?: string | null;
  venue_address?: string | null;
  venue_area?: string | null;
  /** A city id ("pune") when it is one, else the host's words. */
  venue_city?: string | null;
  /** https Google Maps only (checked by the database and again where it is opened). */
  venue_maps_url?: string | null;
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
  /** The repeat that put this game up (20261102_game_series.sql), if any; absent before that file. */
  series_id?: string | null;
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
  /** withdrawn: the requester took it back (it is kept); no list a player or host sees includes it. */
  status: "pending" | "accepted" | "declined" | "withdrawn";
  requester_name: string;
  requester_avatar?: string;
  created_at: string;
  responded_at?: string | null;
}

export interface GameParticipant {
  game_id: string;
  user_id: string;
  joined_at: string;
  name?: string;
  profile_image_url?: string;
}

/** A venue not on TapTurf, as the create flow's form keeps it (stored as games.venue_*). */
export interface TypedVenue {
  name: string;
  address: string;
  area: string | null;
  /** A city id when it is one, else the host's words. */
  city: string;
  mapsUrl: string | null;
}

export interface CreateGameData {
  /** A TapTurf turf; empty when the game is at a typed venue. */
  turfId: string;
  /** The venue the host typed when the turf is not on TapTurf (then turfId is empty). */
  venue?: TypedVenue | null;
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
