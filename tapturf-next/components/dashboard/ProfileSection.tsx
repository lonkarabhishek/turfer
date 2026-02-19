"use client";

import { useState } from "react";
import { User, Save, Phone, Mail } from "lucide-react";
import { updateUserProfile } from "@/lib/queries/users";
import { useAuth } from "@/components/auth/AuthProvider";
import type { AppUser } from "@/types/user";

export function ProfileSection({ user }: { user: AppUser }) {
  const { refreshUser } = useAuth();
  const [name, setName] = useState(user.name || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await updateUserProfile(user.id, {
      name: name.trim(),
      phone: phone.trim() || undefined,
    });
    setSaving(false);

    if (!error) {
      setSaved(true);
      await refreshUser();
      setTimeout(() => setSaved(false), 2000);
    }
  };

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
        <div>
          <p className="text-lg font-semibold text-gray-900">{user.name}</p>
          <p className="text-sm text-gray-500 capitalize">{user.role}</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
          <div className="relative">
            <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 XXXXX XXXXX"
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>

        {/* Email (read-only) */}
        {user.email && (
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
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="flex items-center justify-center gap-2 w-full bg-gray-900 text-white py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
