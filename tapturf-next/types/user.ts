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
  /** An email a phone account typed into an earlier TapTurf (not checked, never used to log in). */
  contactEmail?: string;
  /** The Google account added to this phone account from the profile. */
  googleEmail?: string;
  /** May add, change or remove a Google account (from a phone sign-in). */
  googleLinkable?: boolean;
  /** The number on the account opens it with an OTP. */
  phoneConfirmed?: boolean;
  /** Google is this account's own way in: it may add, confirm, change or remove the number. */
  phoneSettable?: boolean;
  /** Asked once to add Google (a phone account with no email that has not answered yet). */
  askGoogle?: boolean;
  /** The verified tick (a number proved by OTP and an email proved by Google); null or missing: the database can't say yet. */
  verified?: boolean | null;
  /** The number on the account was proved with an OTP (only when verified is known). */
  phoneProven?: boolean;
  /** Google confirmed the account's email (only when verified is known). */
  emailProven?: boolean;
}
