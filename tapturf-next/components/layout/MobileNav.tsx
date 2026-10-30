"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MapPin, Gamepad2, PlusCircle, User } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { UserAvatar } from "@/components/account/UserAvatar";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/turfs", label: "Turfs", icon: MapPin },
  { href: "/games", label: "Games", icon: Gamepad2 },
  { href: "/game/create", label: "Host", icon: PlusCircle, requiresAuth: true },
  { href: "/dashboard", label: "Me", icon: User, requiresAuth: true },
];

/**
 * Full-width bottom nav. Solid white, always fixed to the bottom.
 * Uses padding-bottom: env(safe-area-inset-bottom) so on iOS PWAs
 * (Add to Home Screen) the nav clears the home indicator instead
 * of stretching under it. layout viewport uses viewportFit "cover"
 * so the env() value is populated even in standalone mode.
 * Signed in, "Me" is the person's own picture (photo, avatar or
 * initials), ringed in green on their page; the User icon is only for
 * signed out.
 */
export function MobileNav() {
  const pathname = usePathname();
  const { user, login } = useAuth();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 material-thin border-t border-primary-100/60 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <ul className="flex items-stretch h-14">
        {NAV_ITEMS.map(({ href, label, icon: Icon, requiresAuth }) => {
          const isActive =
            pathname === href ||
            (href !== "/" && pathname.startsWith(href)) ||
            (href === "/turfs" && pathname.startsWith("/turf/"));

          const me = href === "/dashboard" && user;
          const inner = (
            <span
              className={`flex flex-col items-center justify-center gap-0.5 h-full w-full ${
                isActive ? "text-accent-500" : "text-primary-400"
              }`}
            >
              {me ? (
                <UserAvatar
                  src={user.profile_image_url}
                  name={user.name}
                  size={24}
                  eager
                  className={isActive ? "ring-2 ring-accent-500 ring-offset-2 ring-offset-white" : "ring-1 ring-primary-200"}
                />
              ) : (
                <Icon
                  className="w-6 h-6"
                  strokeWidth={isActive ? 2.25 : 1.75}
                />
              )}
              <span className={`text-[10px] ${me && isActive ? "font-semibold" : "font-medium"}`}>
                {label}
              </span>
            </span>
          );

          if (requiresAuth && !user) {
            return (
              <li key={href} className="flex-1">
                <button
                  onClick={login}
                  aria-label={label}
                  className="w-full h-full"
                >
                  {inner}
                </button>
              </li>
            );
          }

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-label={label}
                aria-current={isActive ? "page" : undefined}
                className="block w-full h-full"
              >
                {inner}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
