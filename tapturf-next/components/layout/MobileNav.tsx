"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Gamepad2, PlusCircle, User } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/games", label: "Games", icon: Gamepad2 },
  { href: "/game/create", label: "Create", icon: PlusCircle, requiresAuth: true, isCreate: true },
  { href: "/dashboard", label: "Account", icon: User, requiresAuth: true },
];

export function MobileNav() {
  const pathname = usePathname();
  const { user, login } = useAuth();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-gray-100 md:hidden">
      <div className="flex items-center justify-around h-14">
        {NAV_ITEMS.map(({ href, label, icon: Icon, requiresAuth, isCreate }) => {
          const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));

          if (requiresAuth && !user) {
            return (
              <button
                key={href}
                onClick={login}
                className="flex flex-col items-center gap-0.5 px-3 py-1 text-gray-400"
              >
                {isCreate ? (
                  <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center -mt-3 shadow-md shadow-primary-500/30">
                    <Icon className="w-4.5 h-4.5 text-white" />
                  </div>
                ) : (
                  <Icon className="w-5 h-5" />
                )}
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            );
          }

          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 transition-colors ${
                isActive ? "text-primary-600" : "text-gray-400"
              }`}
            >
              {isCreate ? (
                <div className={`w-8 h-8 rounded-full flex items-center justify-center -mt-3 shadow-md ${
                  isActive ? "bg-primary-600 shadow-primary-600/30" : "bg-primary-500 shadow-primary-500/30"
                }`}>
                  <Icon className="w-4.5 h-4.5 text-white" />
                </div>
              ) : (
                <Icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
              )}
              <span className={`text-[10px] font-medium ${isActive ? "text-primary-600" : ""}`}>{label}</span>
            </Link>
          );
        })}
      </div>
      {/* Safe area for iOS */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
