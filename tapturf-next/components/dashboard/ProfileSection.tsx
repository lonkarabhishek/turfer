"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, Save, Phone, Mail, AtSign, Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { errorOf, patchMe, profileOf } from "@/lib/account/client";
import { AVAILABILITY_TEXT, useUsernameCheck, usernameSavable } from "@/components/account/useUsernameCheck";
import { TagSwitch } from "@/components/account/TagSwitch";
import { GoogleLinkActions } from "@/components/account/GoogleLinkActions";
import { PhoneAddForm } from "@/components/account/PhoneAddForm";
import { VerifiedTick } from "@/components/account/VerifiedTick";
import { VerifyCard } from "@/components/account/VerifyCard";
import { UserAvatar } from "@/components/account/UserAvatar";
import { pictureKind, type PictureKind } from "@/lib/account/avatar";
import { PROFILE_PATH, spacedPhone } from "@/lib/account/display";
import { PHONE_STEP } from "@/lib/account/verified";
import type { MePatch } from "@/lib/account/client";
import type { AccountError } from "@/lib/account/types";
import type { AppUser } from "@/types/user";

const SAVE_ERROR: Partial<Record<AccountError, string>> = {
  taken: "Someone already has this username.",
  reserved: "This username is not allowed.",
  bad: "Check your name and username.",
  limit: "You can change your username 3 times in 30 days. Try again later.",
  sign_in: "Your login ended. Please log in again.",
  new: "Your login ended. Please log in again.",
  conflict: "We need to check this account. Email info@tapturf.in and we'll sort it out.",
  slow: "Too many tries. Wait a minute and try again.",
  unavailable: "Couldn't reach TapTurf. Check your connection and try again.",
};

const PHOTO_WORDS: Record<PictureKind | "none", string> = {
  upload: "Your photo",
  google: "Your Google photo",
  preset: "A sports avatar",
  other: "Your photo",
  none: "Your initials. Add a photo or pick an avatar.",
};

export function ProfileSection({ user, onEditPhoto }: { user: AppUser; onEditPhoto: () => void }) {
  const { getToken, applyProfile, refreshUser, signedInWith } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  // What the person typed; until then, what the server sent.
  const [draft, setDraft] = useState<{ name?: string; username?: string; taggable?: boolean }>({});
  const name = draft.name ?? (user.name || "");
  const username = draft.username ?? (user.username ?? "");
  const taggable = draft.taggable ?? (user.taggable ?? true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  // The email row's own news ("Google account removed.") and the typed email's Remove.
  const [emailNote, setEmailNote] = useState("");
  const [removingTyped, setRemovingTyped] = useState(false);
  const [typedError, setTypedError] = useState("");

  // Back from the Google sign-in the phone row asked for (?add=phone): open it, and take the word out of the address.
  const [addPhoneNow] = useState(() => params.get("add") === "phone");
  // The verified tick card's "Add phone number", and the tick's asks elsewhere (?add=phone-step): the
  // phone row's own step, as its button opens it (Google first when that sign-in is over 5 minutes old).
  const [phoneSignal, setPhoneSignal] = useState(() => (params.get("add") === PHONE_STEP ? 1 : 0));
  useEffect(() => {
    const add = params.get("add");
    if (add === "phone" || add === PHONE_STEP) router.replace(PROFILE_PATH, { scroll: false });
  }, [params, router]);

  // The latest from the server, once: another device may have changed it.
  useEffect(() => {
    void refreshUser();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // myTapturf's "Pick a username" comes here (#username): the box, ready to type in.
  useEffect(() => {
    if (window.location.hash !== "#username") return;
    const box = document.getElementById("profile-username");
    box?.scrollIntoView({ block: "center" });
    box?.focus({ preventScroll: true });
  }, []);

  const u = username.trim();
  const usernameChanged = u !== (user.username ?? "");
  const availability = useUsernameCheck(u, user.username, getToken);

  // Only what the person changed is sent: a copy loaded earlier must never put back a switch or a username changed since.
  const nameChanged = draft.name !== undefined && name.trim() !== user.name;
  // The switch belongs to a username: with none (now or typed), there is nothing to save it on.
  const taggableChanged = draft.taggable !== undefined && taggable !== (user.taggable ?? true) && (!!u || !!user.username);
  // A username can be changed but not removed.
  const usernameCleared = usernameChanged && !u && !!user.username;
  const anyChange = nameChanged || (usernameChanged && !!u) || taggableChanged;
  // Going to Google (or changing the number) would lose what was typed here.
  const dirty = anyChange || usernameCleared;
  const canSave = !saving && !!name.trim() && anyChange && !usernameCleared && (!usernameChanged || (!!u && usernameSavable(availability)));

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      const tok = await getToken();
      if (!("token" in tok)) {
        if ("unknown" in tok) setError("Couldn't reach TapTurf. Check your connection and try again.");
        return;
      }
      const patch: MePatch = {};
      if (nameChanged) patch.name = name.trim();
      if (usernameChanged && u) patch.username = u;
      if (taggableChanged) patch.taggable = taggable;
      const a = await patchMe(tok.token, patch);
      const p = profileOf(a);
      if (p) applyProfile(p);
      const e = errorOf(a);
      if (e) {
        setError(SAVE_ERROR[e] ?? "Couldn't save. Please try again.");
        return;
      }
      setDraft({});
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  /** The email typed into an earlier TapTurf goes (it never logged anyone in). */
  const removeTyped = async () => {
    setTypedError("");
    setRemovingTyped(true);
    try {
      const tok = await getToken();
      if (!("token" in tok)) return setTypedError("Couldn't remove it. Try again.");
      const a = await patchMe(tok.token, { email: null });
      const p = profileOf(a);
      if (p) applyProfile(p);
      if (errorOf(a) || !p) setTypedError("Couldn't remove it. Try again.");
    } finally {
      setRemovingTyped(false);
    }
  };

  const status = AVAILABILITY_TEXT[availability];
  const byPhone = signedInWith === "phone";
  const byGoogle = signedInWith === "google";
  const readOnly = (icon: "mail" | "phone", value: string) => (
    <div className="relative">
      {icon === "mail" ? (
        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      ) : (
        <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      )}
      <input
        type={icon === "mail" ? "email" : "tel"}
        value={value}
        disabled
        aria-label={icon === "mail" ? "Email" : "Phone"}
        className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-500 truncate"
      />
    </div>
  );

  // The email row: the Google account added to a phone account, the Google account an account logs in with, or the way to add one.
  const emailRow = user.googleEmail ? (
    <>
      {readOnly("mail", user.googleEmail)}
      {byPhone ? (
        <>
          <p className="mt-1.5 mb-2 text-xs text-gray-500">Log in with Google or your phone number. Both open this account.</p>
          {user.googleLinkable && (
            <GoogleLinkActions mode="linked" then={PROFILE_PATH} googleEmail={user.googleEmail} disabled={dirty} onRemoved={() => setEmailNote("Google account removed.")} />
          )}
        </>
      ) : (
        <p className="mt-1.5 text-xs text-gray-500">To change or remove this Google account, log in with your phone number.</p>
      )}
    </>
  ) : user.email ? (
    <>
      {readOnly("mail", user.email)}
      <p className="mt-1.5 text-xs text-gray-500">This is the Google account you log in with. It can&rsquo;t be changed here.</p>
    </>
  ) : byPhone && user.googleLinkable ? (
    <GoogleLinkActions mode="add" then={PROFILE_PATH} typedEmail={user.contactEmail} disabled={dirty} />
  ) : null;

  const typedRow = user.contactEmail && (
    <div className="mt-3 rounded-xl bg-primary-50 px-3 py-2.5">
      <p className="text-[13px] text-primary-700 leading-snug break-words">
        Email you typed earlier: <span className="font-medium text-primary-900">{user.contactEmail}</span>. It isn&rsquo;t used to log in.
      </p>
      <button
        type="button"
        onClick={() => void removeTyped()}
        disabled={removingTyped}
        aria-label="Remove typed email"
        className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-hot-600 underline underline-offset-2 disabled:opacity-50 cursor-pointer"
      >
        {removingTyped && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        Remove
      </button>
      {typedError && (
        <p className="mt-1 text-[12px] font-medium text-hot-600" role="alert">
          {typedError}
        </p>
      )}
    </div>
  );

  // The phone row: a Google account whose own way in is Google can add, confirm, change or remove its number.
  // Confirmed means proved with an OTP where the database knows (the tick): a number that opens the
  // account but was never proved is offered Confirm, which gives the tick its phone half, next to
  // its Change and Remove (it still opens the account).
  const phoneRow =
    byGoogle && user.phoneSettable ? (
      <PhoneAddForm
        current={user.phone}
        confirmed={user.phoneProven ?? user.phoneConfirmed === true}
        opens={user.phoneConfirmed === true}
        autoOpen={addPhoneNow}
        openSignal={phoneSignal}
        disabled={dirty}
        googleEmail={user.email}
      />
    ) : user.phone ? (
      <>
        {readOnly("phone", spacedPhone(user.phone))}
        <p className="mt-1.5 text-xs text-gray-500">
          {byPhone
            ? "This is the number you log in with. Only you can see it."
            : user.googleEmail
              ? "This is the number your account logs in with. To change it, email info@tapturf.in."
              : "Only you can see this."}
        </p>
      </>
    ) : null;

  return (
    <div className="max-w-md">
      {/* Photo: the sheet is the Me tab's (the header's camera opens it too) */}
      <div className="flex items-center gap-4 mb-6">
        <UserAvatar src={user.profile_image_url} name={user.name} size={64} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 min-w-0 text-[15px] font-semibold text-gray-900">
            <span className="truncate">{user.name}</span>
            {user.verified && <VerifiedTick />}
          </p>
          <p className="text-sm text-gray-500 truncate">{PHOTO_WORDS[pictureKind(user.profile_image_url) ?? "none"]}</p>
        </div>
        <button
          type="button"
          onClick={onEditPhoto}
          className="shrink-0 inline-flex items-center gap-1.5 min-h-[40px] rounded-full border border-primary-200 bg-white px-4 text-[13px] font-semibold text-primary-800 hover:border-primary-300 focus-neon"
        >
          <Camera className="w-4 h-4" aria-hidden />
          {user.profile_image_url ? "Change photo" : "Add photo"}
        </button>
      </div>

      <VerifyCard user={user} dirty={dirty} onAddPhone={() => setPhoneSignal((n) => n + 1)} />

      <div className="space-y-5">
        {/* Name */}
        <div>
          <label htmlFor="profile-name" className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
          <input
            id="profile-name"
            type="text"
            value={name}
            maxLength={60}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>

        {/* Username */}
        <div id="username" className="scroll-mt-24">
          <label htmlFor="profile-username" className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
          <div className="relative">
            <AtSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              id="profile-username"
              type="text"
              value={username}
              maxLength={20}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="pick a username"
              aria-describedby="profile-username-status"
              onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value.replace(/\s/g, "").toLowerCase() }))}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <p
            id="profile-username-status"
            aria-live="polite"
            className={`mt-1.5 text-xs min-h-4 ${availability === "ok" ? "text-accent-700" : availability === "checking" ? "text-gray-500" : "text-hot-600"}`}
          >
            {status}
          </p>
          {usernameCleared ? (
            <p className="text-xs text-hot-600">Usernames can&rsquo;t be removed. Type one, or undo.</p>
          ) : (
            usernameChanged && user.username && (
              <p className="text-xs text-gray-500">Your old username keeps pointing to you, and nobody else can take it.</p>
            )
          )}
        </div>

        {/* Find and tag */}
        <div>
          <TagSwitch
            on={taggable}
            disabled={!username.trim()}
            onChange={(on) => setDraft((d) => ({ ...d, taggable: on }))}
            detail="Friends who score live matches can tag you as a player. Off also hides your profile page and the “Managed by” line on turfs you run."
          />
          {user.username && user.taggable !== false && (
            <Link href={`/u/${user.username}`} className="inline-block mt-2 text-sm font-semibold text-accent-700 underline underline-offset-2">
              See your public profile
            </Link>
          )}
        </div>

        {/* Phone */}
        {phoneRow && (
          <div>
            <p className="block text-sm font-medium text-gray-700 mb-1.5">Phone</p>
            {phoneRow}
          </div>
        )}

        {/* Email: from Google only; an email typed into an earlier TapTurf can be removed */}
        {(emailRow || typedRow || emailNote) && (
          <div>
            <p className="block text-sm font-medium text-gray-700 mb-1.5">Email</p>
            {emailNote && !user.googleEmail && (
              <p className="mb-2 rounded-xl bg-accent-50 px-3 py-2 text-[13px] text-accent-800" role="status">
                {emailNote}
              </p>
            )}
            {emailRow}
            {typedRow}
          </div>
        )}

        {error && <p className="text-sm text-hot-600 font-medium" role="alert">{error}</p>}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="flex items-center justify-center gap-2 w-full bg-gray-900 text-white py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
