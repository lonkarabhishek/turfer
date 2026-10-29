/**
 * The last words on the home page, after the closing band: "With
 * TapTurf / Playing should be easy." (the owner's line, 29 Oct). Text
 * only, centred, clear of the bottom nav on phones.
 */
export function ClosingLine() {
  return (
    <section aria-label="TapTurf" className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-14 md:pb-20 text-center">
      <p className="text-[15px] md:text-[17px] font-semibold tracking-wide text-primary-500">With TapTurf</p>
      <p className="mt-1 font-display text-primary-900 text-[34px] md:text-[48px] leading-tight">
        Playing should be <span className="text-accent-500">easy.</span>
      </p>
    </section>
  );
}
