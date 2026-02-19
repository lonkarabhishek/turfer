import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-gray-50 border-t border-gray-200 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <h3 className="font-bold text-xl text-gray-900 tracking-tight">
              Tap<span className="text-primary-500">Turf</span>
            </h3>
            <p className="mt-3 text-sm text-gray-500 leading-relaxed">
              Nashik&apos;s turf discovery platform. Find, compare, and book
              sports turfs instantly.
            </p>
          </div>

          {/* Sports */}
          <div>
            <h4 className="font-semibold text-sm text-gray-900 mb-4">
              Sports
            </h4>
            <ul className="space-y-2.5 text-sm text-gray-500">
              <li>
                <Link href="/sport/football" className="hover:text-gray-900 transition-colors">
                  Football
                </Link>
              </li>
              <li>
                <Link href="/sport/cricket" className="hover:text-gray-900 transition-colors">
                  Cricket
                </Link>
              </li>
              <li>
                <Link href="/sport/basketball" className="hover:text-gray-900 transition-colors">
                  Basketball
                </Link>
              </li>
              <li>
                <Link href="/sport/badminton" className="hover:text-gray-900 transition-colors">
                  Badminton
                </Link>
              </li>
            </ul>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold text-sm text-gray-900 mb-4">
              Explore
            </h4>
            <ul className="space-y-2.5 text-sm text-gray-500">
              <li>
                <Link href="/turfs" className="hover:text-gray-900 transition-colors">
                  All Turfs
                </Link>
              </li>
              <li>
                <Link href="/sport/tennis" className="hover:text-gray-900 transition-colors">
                  Tennis
                </Link>
              </li>
              <li>
                <Link href="/sport/pickleball" className="hover:text-gray-900 transition-colors">
                  Pickleball
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold text-sm text-gray-900 mb-4">
              Get in Touch
            </h4>
            <ul className="space-y-2.5 text-sm text-gray-500">
              <li>Nashik, Maharashtra</li>
              <li>
                <a
                  href="mailto:support@tapturf.in"
                  className="hover:text-gray-900 transition-colors"
                >
                  support@tapturf.in
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-gray-200 text-center text-sm text-gray-400">
          &copy; {new Date().getFullYear()} TapTurf. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
