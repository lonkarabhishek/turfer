import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-primary-600 border-t border-primary-700 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <h3 className="font-bold text-2xl text-white tracking-tight font-serif">
              Tap<span className="text-accent-400">Turf</span>
            </h3>
            <p className="mt-3 text-sm text-primary-200 leading-relaxed">
              Nashik&apos;s premier turf discovery platform. Find, compare, and
              book sports turfs instantly.
            </p>
            <div className="mt-4 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-400" />
              <span className="text-xs text-primary-300">Nashik, Maharashtra</span>
            </div>
          </div>

          {/* Sports */}
          <div>
            <h4 className="font-semibold text-sm text-accent-400 mb-4 uppercase tracking-widest">
              Sports
            </h4>
            <ul className="space-y-2.5 text-sm text-primary-200">
              {["football", "cricket", "basketball", "badminton"].map((sport) => (
                <li key={sport}>
                  <Link
                    href={`/sport/${sport}`}
                    className="hover:text-white transition-colors capitalize"
                  >
                    {sport}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Explore */}
          <div>
            <h4 className="font-semibold text-sm text-accent-400 mb-4 uppercase tracking-widest">
              Explore
            </h4>
            <ul className="space-y-2.5 text-sm text-primary-200">
              <li>
                <Link href="/turfs" className="hover:text-white transition-colors">
                  All Turfs
                </Link>
              </li>
              <li>
                <Link href="/games" className="hover:text-white transition-colors">
                  Open Games
                </Link>
              </li>
              <li>
                <Link href="/sport/tennis" className="hover:text-white transition-colors">
                  Tennis
                </Link>
              </li>
              <li>
                <Link href="/sport/pickleball" className="hover:text-white transition-colors">
                  Pickleball
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold text-sm text-accent-400 mb-4 uppercase tracking-widest">
              Contact
            </h4>
            <ul className="space-y-2.5 text-sm text-primary-200">
              <li>
                <a
                  href="mailto:support@tapturf.in"
                  className="hover:text-white transition-colors"
                >
                  support@tapturf.in
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
          <p className="text-xs text-primary-500">
            Made with care in Nashik 🇮🇳
          </p>
        </div>
      </div>
    </footer>
  );
}
