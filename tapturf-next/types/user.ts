export interface AppUser {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: "player" | "owner" | "admin";
  profile_image_url?: string;
  /** Their TapTurf username, once picked. */
  username?: string;
  /** "Let others find and tag me". */
  taggable?: boolean;
}
