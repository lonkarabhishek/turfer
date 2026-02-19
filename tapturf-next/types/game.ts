export interface Game {
  id: string;
  creator_id: string;
  turf_id: string;
  title: string;
  sport: string;
  format: string;
  skill_level: "beginner" | "intermediate" | "advanced" | "all";
  date: string;
  start_time: string;
  end_time: string;
  current_players: number;
  max_players: number;
  price_per_player: number;
  description?: string;
  notes?: string;
  is_private: boolean;
  turf_booked: boolean;
  status: "open" | "full" | "in_progress" | "completed" | "cancelled";
  host_name: string;
  host_phone: string;
  host_profile_image_url?: string;
  created_at: string;
  // Joined data from turfs table
  turfs?: {
    id: string;
    name: string;
    address: string;
    "Gmap Embed link"?: string;
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
