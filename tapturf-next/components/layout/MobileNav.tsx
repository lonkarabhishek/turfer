"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Gamepad2, Plus, User } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/games", label: "Games", icon: Gamepad2 },
  { href: "/game/create", label: "Host", icon: Plus, requiresAuth: true, isCreate: true },
  { href: "/dashboard", label: "Me", icon: User, requiresAuth: true },
];

export function MobileNav() {
  const pathname = usePathname();
  const { user, login } = useAuth();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-primary-950/90 backdrop-blur-xl border-t border-white/10 md:hidden">
      <div className="flex items-center justify-around h-16 px-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon, requiresAuth, isCreate }) => {
          const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));

          if (requiresAuth && !user) {
            return (
              <button
                key={href}
                onClick={login}
                className="flex flex-col items-center gap-0.5 px-3 py-1"
              >
                {isCreate ? (
                  <div className="w-12 h-12 bg-accent-400 rounded-full flex items-center justify-center -mt-4 shadow-neon">
                    <Icon className="w-5 h-5 text-primary-950" strokeWidth={3} />
                  </div>
                ) : (
                  <Icon className="w-5 h-5 text-white/50" />
                )}
                <span className="text-[10px] font-mono uppercase tracking-wider text-white/50 mt-0.5">
                  {label}
                </span>
              </button>
            );
          }

          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-0.5 px-3 py-1 transition-colors"
            >
              {isCreate ? (
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center -mt-4 transition-all ${
                    isActive
                      ? "bg-accent-300 shadow-neon scale-105"
                      : "bg-accent-400 shadow-neon"
                  }`}
                >
                  <Icon className="w-5 h-5 text-primary-950" strokeWidth={3} />
                </div>
              ) : (
                <Icon
                  className={`w-5 h-5 transition-all ${
                    isActive ? "text-accent-400 stroke-[2.5]" : "text-white/50"
                  }`}
                />
              )}
              <span
                className={`text-[10px] font-mono uppercase tracking-wider mt-0.5 ${
                  isActive ? "text-accent-400" : "text-white/50"
                }`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)] bg-primary-950" />
    </nav>
  );
}
