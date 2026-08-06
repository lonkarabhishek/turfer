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

export function MobileNav() {
  const pathname = usePathname();
  const { user, login } = useAuth();

  return (
    <>
      {/* Floating pill nav — centered at the bottom, doesn't touch edges. */}
      <nav
        className="fixed left-1/2 -translate-x-1/2 z-30 md:hidden"
        style={{
          bottom: "max(0.75rem, calc(env(safe-area-inset-bottom) + 0.5rem))",
        }}
        aria-label="Primary"
      >
        <ul className="flex items-center gap-1 bg-primary-800/95 backdrop-blur-md rounded-full px-1.5 py-1.5 shadow-elevated">
          {NAV_ITEMS.map(({ href, label, icon: Icon, requiresAuth }) => {
            const isActive =
              pathname === href || (href !== "/" && pathname.startsWith(href));

            const inner = (
              <span
                className={`flex items-center gap-1.5 rounded-full transition-all min-h-[44px] ${
                  isActive
                    ? "bg-accent-500 text-white px-4 py-2 shadow-neon"
                    : "text-white/70 px-3 py-2 hover:text-white"
                }`}
              >
                <Icon
                  className="w-[18px] h-[18px]"
                  strokeWidth={isActive ? 2.5 : 2}
                />
                {isActive && (
                  <span className="text-xs font-bold uppercase tracking-wide">
                    {label}
                  </span>
                )}
              </span>
            );

            if (requiresAuth && !user) {
              return (
                <li key={href}>
                  <button
                    onClick={login}
                    aria-label={label}
                    className="focus-neon rounded-full"
                  >
                    {inner}
                  </button>
                </li>
              );
            }

            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-label={label}
                  aria-current={isActive ? "page" : undefined}
                  className="focus-neon rounded-full"
                >
                  {inner}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
