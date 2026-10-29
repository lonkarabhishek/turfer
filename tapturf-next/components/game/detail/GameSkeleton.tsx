/** The game page while it loads: the same boxes as the real page, so nothing jumps when it arrives. */
export function GameSkeleton() {
  return (
    <div className="md:max-w-2xl lg:max-w-6xl mx-auto sm:px-6 sm:pt-5 lg:pt-6 motion-safe:animate-pulse" aria-busy="true" aria-label="Loading the game">
      <div className="hidden lg:block h-11 mb-2" />
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
        <div className="min-w-0">
          <div className="aspect-[2/1] lg:aspect-[21/9] bg-primary-100 sm:rounded-3xl" />
          <div className="relative -mt-5 sm:mt-5 rounded-t-[24px] sm:rounded-none bg-white px-4 sm:px-0 pt-4 sm:pt-0 pb-2">
            <div className="h-7 w-4/5 rounded-lg bg-primary-100" />
            <div className="mt-2 h-7 w-1/2 rounded-lg bg-primary-100" />
            <div className="mt-3 h-4 w-2/5 rounded bg-primary-100" />
            <div className="mt-3 h-6 w-1/3 rounded-full bg-primary-100" />
          </div>
          <div className="px-4 sm:px-0 mt-3">
            <div className="rounded-2xl border border-primary-200 divide-y divide-primary-100">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 min-h-16">
                  <div className="size-10 rounded-xl bg-primary-100" />
                  <div className="flex-1">
                    <div className="h-4 w-2/5 rounded bg-primary-100" />
                    <div className="mt-2 h-3.5 w-3/5 rounded bg-primary-100" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="hidden lg:block h-96 rounded-3xl border border-primary-200 bg-primary-50" />
      </div>
    </div>
  );
}
