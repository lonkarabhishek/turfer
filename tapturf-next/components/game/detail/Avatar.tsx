"use client";

import { UserAvatar } from "@/components/account/UserAvatar";

/**
 * A player's round picture on game pages: their photo or avatar, else
 * their initials on a colour of their own (components/account/UserAvatar).
 * Decorative: the name is always next to it. `size` in CSS pixels.
 */
export function Avatar({ src, name, size = 32, className = "" }: { src?: string | null; name?: string | null; size?: number; className?: string }) {
  return <UserAvatar src={src} name={name} size={size} className={className} />;
}
