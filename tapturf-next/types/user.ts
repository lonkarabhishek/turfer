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
  /** The optional email a phone account typed (for deals and invites; not checked). */
  contactEmail?: string;
  /** A phone account with no email that has not answered the ask yet. */
  askEmail?: boolean;
  /** May add an email (a phone account with no email, and the database has the feature). */
  emailEditable?: boolean;
}
