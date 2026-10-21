import Link from "next/link";
import { getFooterCities, HOME_CITIES } from "@/lib/queries/cities";
import { CITIES } from "@/lib/city";
import { SPORT_PAGES } from "@/lib/sports";
import { CONTACT_EMAIL, CONTACT_MAILTO, WHATSAPP_URL } from "@/lib/contact";

/** City links on every desktop page: the twelve biggest live cities. */
const LINKED_CITIES = 12;

/**
 * Server component (rendered inside the client providers, which is
 * allowed). Reads the live city list, cached for a day (getFooterCities:
 * an hourly copy here made every page, turf pages included, refresh
 * hourly), so the city count and the biggest-first order stay honest
 * without a code change.
 */
export async function Footer() {
  // The footer is on every page, including ones that read nothing else
  // from the database: if the live list cannot be read and nothing is
  // cached, link the curated cities for this render rather than fail the
  // page (getFooterCities caches nothing when it throws).
  const cities = await getFooterCities().catch(() => CITIES.map((c) => ({ ...c, n: 0 })));
  // Biggest cities first, plus the home cities (where TapTurf started
  // and launched next) when they fall outside the cut, so no city page
  // that had a sitewide link loses it.
  const top = cities.slice(0, LINKED_CITIES);
  const linked = [...top, ...cities.filter((c) => HOME_CITIES.includes(c.id) && !top.includes(c))];

  return (
    <footer className="bg-primary-600 border-t border-primary-700 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <h3 className="font-bold text-2xl text-white tracking-tight font-serif">
              Tap<span className="text-accent-400">Turf</span>
            </h3>
            <p className="mt-3 text-sm text-primary-200 leading-relaxed">
              Find, compare and book sports turfs {cities.length > 0 ? `in ${cities.length} cities ` : ""}across India.
            </p>
            {top.length > 0 && (
              <div className="mt-4 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-400" />
                <span className="text-xs text-primary-300">
                  {top.map((c) => c.label).join(" · ")}
                  {cities.length > top.length ? ` · ${cities.length - top.length} more` : ""}
                </span>
              </div>
            )}
          </div>

          {/* Sports */}
          <div>
            <h4 className="font-semibold text-sm text-accent-400 mb-4">
              Sports
            </h4>
            <ul className="space-y-2.5 text-sm text-primary-200">
              {SPORT_PAGES.slice(0, 6).map((sport) => (
                <li key={sport.slug}>
                  <Link
                    href={`/sport/${sport.slug}`}
                    className="hover:text-white transition-colors"
                  >
                    {sport.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Explore */}
          <div>
            <h4 className="font-semibold text-sm text-accent-400 mb-4">
              Explore
            </h4>
            <ul className="space-y-2.5 text-sm text-primary-200">
              <li>
                <Link href="/turfs" className="hover:text-white transition-colors">
                  All Turfs
                </Link>
              </li>
              <li>
                <Link href="/turf-near-me" className="hover:text-white transition-colors">
                  Turf Near Me
                </Link>
              </li>
              <li>
                <Link href="/games" className="hover:text-white transition-colors">
                  Open Games
                </Link>
              </li>
              <li>
                <Link href="/blog" className="hover:text-white transition-colors">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="/tools" className="hover:text-white transition-colors">
                  Free Sports Tools
                </Link>
              </li>
              <li>
                <Link href="/my" className="hover:text-white transition-colors">
                  myTapturf for owners
                </Link>
              </li>
            </ul>
          </div>

          {/* Cities */}
          {linked.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm text-accent-400 mb-4">
                Cities
              </h4>
              <ul className="space-y-2.5 text-sm text-primary-200">
                {linked.map((c) => (
                  <li key={c.id}>
                    <Link href={`/${c.id}`} className="hover:text-white transition-colors">
                      Turfs in {c.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Contact */}
          <div>
            <h4 className="font-semibold text-sm text-accent-400 mb-4">
              Contact
            </h4>
            <ul className="space-y-2.5 text-sm text-primary-200">
              <li>
                <a href={CONTACT_MAILTO} className="hover:text-white transition-colors">
                  {CONTACT_EMAIL}
                </a>
              </li>
              <li>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  WhatsApp us
                </a>
              </li>
              <li>
                <Link href="/game/create" className="hover:text-white transition-colors">
                  Host a Game
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-primary-700 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-sm text-primary-400">
            &copy; {new Date().getFullYear()} TapTurf. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-xs text-primary-400">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <span className="text-primary-500">Made with care in Nashik 🇮🇳</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
