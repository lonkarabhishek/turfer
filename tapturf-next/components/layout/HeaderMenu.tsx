"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, MapPin, Gamepad2, PlusCircle, Calculator, BookOpen, LocateFixed } from "lucide-react";
import { CityPicker } from "@/components/city/CityPicker";

const LINKS = [
  { href: "/turfs", label: "All turfs", icon: MapPin },
  { href: "/turf-near-me", label: "Turf near me", icon: LocateFixed },
  { href: "/games", label: "Open games", icon: Gamepad2 },
  { href: "/game/create", label: "Host a game", icon: PlusCircle },
  { href: "/tools", label: "Free cricket tools", icon: Calculator },
  { href: "/blog", label: "Blog", icon: BookOpen },
];

/**
 * The three-line menu. Holds the city picker (with "Use my location")
 * and the main links, so the header stays clean. Bottom sheet on phones,
 * a dropdown card on desktop. Closes on navigation and Esc.
 */
export function HeaderMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const t = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Menu"
        aria-expanded={open}
        className="w-10 h-10 inline-flex items-center justify-center rounded-full border border-primary-200 bg-white hover:border-accent-500 transition-colors focus-neon"
      >
        <Menu className="w-5 h-5 text-primary-800" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-start md:justify-end" role="presentation">
          <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="absolute inset-0 bg-primary-800/40 animate-fade-in cursor-default" />
          <div
            role="dialog"
            aria-label="Menu"
            className="relative w-full md:w-80 md:mt-[72px] md:mr-6 bg-white rounded-t-3xl md:rounded-3xl shadow-elevated animate-slide-up overflow-hidden max-h-[88dvh] flex flex-col"
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <p className="font-display text-xl text-primary-900">Menu</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="w-9 h-9 inline-flex items-center justify-center rounded-full hover:bg-primary-100">
                <X className="w-4 h-4 text-primary-500" />
              </button>
            </div>

            <div className="px-3 pb-3 overflow-y-auto">
              {/* City, with "Use my location" inside the picker sheet. */}
              <CityPicker variant="row" />

              <div className="h-px bg-primary-200 mx-2 my-2" />
              <nav aria-label="Main">
                {LINKS.map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href} className="flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-primary-50 text-[15px] font-medium text-primary-900 transition-colors">
                    <Icon className="w-4 h-4 text-accent-600" />
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="md:hidden h-[env(safe-area-inset-bottom)] bg-white" />
          </div>
        </div>
      )}
    </>
  );
}
