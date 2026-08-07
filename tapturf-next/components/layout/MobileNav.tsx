"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Gamepad2, Plus, User } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/games", label: "Games", icon: Gamepad2 },
  { href: "/game/create", label: "Host", icon: Plus, requiresAuth: true },
  { href: "/dashboard", label: "Me", icon: User, requiresAuth: true },
];

/**
 * Full-width bottom nav. Solid white — no backdrop-blur so entry-level
 * Androids (Snapdragon 4xx / MediaTek Helio) don't burn the GPU repainting
 * a blurred layer under every scroll frame.
 */
export function MobileNav() {
  const pathname = usePathname();
  const { user, login } = useAuth();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-primary-200 md:hidden"
      aria-label="Primary"
    >
      <ul className="flex items-stretch h-14">
        {NAV_ITEMS.map(({ href, label, icon: Icon, requiresAuth }) => {
          const isActive =
            pathname === href || (href !== "/" && pathname.startsWith(href));

          const inner = (
            <span
              className={`flex flex-col items-center justify-center gap-0.5 h-full w-full ${
                isActive ? "text-accent-600" : "text-primary-500"
              }`}
            >
              <Icon
                className="w-5 h-5"
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                isActive ? "text-accent-600" : "text-primary-500"
              }`}>
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
      {/* Safe area for notched devices */}
      <div className="h-[env(safe-area-inset-bottom)] bg-white" />
    </nav>
  );
}
