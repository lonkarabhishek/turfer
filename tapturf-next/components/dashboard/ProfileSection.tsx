"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { User, Save, Phone, Mail, AtSign } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { errorOf, patchMe, profileOf } from "@/lib/account/client";
import { AVAILABILITY_TEXT, useUsernameCheck, usernameSavable } from "@/components/account/useUsernameCheck";
import { TagSwitch } from "@/components/account/TagSwitch";
import { cleanEmail, emailProblem, emailTypo } from "@/lib/account/emails";
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
  email: "That email doesn't look right.",
  conflict: "We need to check this account. Email info@tapturf.in and we'll sort it out.",
  slow: "Too many tries. Wait a minute and try again.",
  unavailable: "Couldn't reach TapTurf. Check your connection and try again.",
};

export function ProfileSection({ user }: { user: AppUser }) {
  const { getToken, applyProfile, refreshUser } = useAuth();
  // What the person typed; until then, what the server sent.
  const [draft, setDraft] = useState<{ name?: string; username?: string; taggable?: boolean; email?: string }>({});
  const name = draft.name ?? (user.name || "");
  const username = draft.username ?? (user.username ?? "");
  const taggable = draft.taggable ?? (user.taggable ?? true);
  // Phone accounts can add an email (for deals and invites); a Google account's comes from Google.
  const emailEditable = !user.email && user.emailEditable === true;
  const email = draft.email ?? (user.contactEmail ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // The latest from the server, once: another device may have changed it.
  useEffect(() => {
    void refreshUser();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const u = username.trim();
  const usernameChanged = u !== (user.username ?? "");
  const availability = useUsernameCheck(u, user.username, getToken);

  // Only what the person changed is sent: a copy loaded earlier must never put back a switch or a username changed since.
  const nameChanged = draft.name !== undefined && name.trim() !== user.name;
  // The switch belongs to a username: with none (now or typed), there is nothing to save it on.
  const taggableChanged = draft.taggable !== undefined && taggable !== (user.taggable ?? true) && (!!u || !!user.username);
  const emailIssue = emailEditable && draft.email !== undefined ? emailProblem(email) : null;
  const emailNext = email.trim() ? cleanEmail(email) : null;
  const emailChanged = emailEditable && draft.email !== undefined && !emailIssue && emailNext !== (user.contactEmail ?? null);
  // A username can be changed but not removed.
  const usernameCleared = usernameChanged && !u && !!user.username;
  const anyChange = nameChanged || (usernameChanged && !!u) || taggableChanged || emailChanged;
  const canSave = !saving && !!name.trim() && anyChange && !emailIssue && !usernameCleared && (!usernameChanged || (!!u && usernameSavable(availability)));

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
      if (emailChanged) patch.email = emailNext;
      if (usernameChanged && u) patch.username = u;
      if (taggableChanged) patch.taggable = taggable;
      const a = await patchMe(tok.token, patch);
      const p = profileOf(a);
      if (p) applyProfile(p);
      const e = errorOf(a);
      if (e) {
        // The email is saved before the username, so a limit with an email change is the email's.
        const limitIsEmail = e === "limit" && emailChanged && p?.contact_email !== emailNext;
        setError(limitIsEmail ? "You've changed your email a few times today. Try again tomorrow." : SAVE_ERROR[e] ?? "Couldn't save. Please try again.");
        return;
      }
      setDraft({});
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const status = AVAILABILITY_TEXT[availability];

  return (
    <div className="max-w-md">
      {/* Avatar */}
      <div className="flex items-center gap-4 mb-6">
        {user.profile_image_url ? (
          <img
            src={user.profile_image_url}
            alt=""
            className="w-16 h-16 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
            <User className="w-8 h-8 text-gray-500" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-lg font-semibold text-gray-900 truncate">{user.name}</p>
          {user.username ? (
            <p className="text-sm text-gray-500 truncate">@{user.username}</p>
          ) : (
            <p className="text-sm text-gray-500 capitalize">{user.role}</p>
          )}
        </div>
      </div>

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
        <div>
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
            detail="Friends who score live matches can tag you as a player. Off also hides your profile page."
          />
          {user.username && user.taggable !== false && (
            <Link href={`/u/${user.username}`} className="inline-block mt-2 text-sm font-semibold text-accent-700 underline underline-offset-2">
              See your public profile
            </Link>
          )}
        </div>

        {/* Phone (read-only: it is the login number) */}
        {user.phone && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="tel"
                value={user.phone}
                disabled
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-500"
              />
            </div>
            <p className="mt-1.5 text-xs text-gray-500">Only you can see this.</p>
          </div>
        )}

        {/* Email: a Google account's is read-only; a phone account can add one */}
        {user.email || !emailEditable ? (
          user.email && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={user.email}
                disabled
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-500"
              />
            </div>
          </div>
          )
        ) : (
          <div>
            <label htmlFor="profile-email" className="block text-sm font-medium text-gray-700 mb-1.5">
              Email <span className="font-normal text-gray-500">(optional)</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                id="profile-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={254}
                value={email}
                placeholder="you@gmail.com"
                aria-describedby="profile-email-help"
                onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <p id="profile-email-help" className={`mt-1.5 text-xs ${emailIssue ? "text-hot-600" : "text-gray-500"}`}>
              {emailIssue ??
                (user.contactEmail && draft.email !== undefined && !email.trim()
                  ? "Save to remove your email."
                  : "For turf deals and game invites. Only the TapTurf team sees it.")}
            </p>
            {!emailIssue && emailTypo(email) && (
              <button type="button" onClick={() => setDraft((d) => ({ ...d, email: emailTypo(email) ?? email }))} className="mt-1 text-xs font-semibold text-accent-700 underline underline-offset-2">
                Did you mean {emailTypo(email)}?
              </button>
            )}
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
