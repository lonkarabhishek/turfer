/** "Let others find and tag me", as a switch with its explanation. */
export function TagSwitch({ on, onChange, detail, disabled }: { on: boolean; onChange: (on: boolean) => void; detail: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="w-full min-h-14 py-2 flex items-center justify-between gap-4 text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold text-primary-800">Let others find and tag me</span>
        <span className="block text-[12px] text-primary-500 mt-0.5">{detail}</span>
      </span>
      <span className={`relative w-[51px] h-[31px] rounded-full shrink-0 transition-colors ${on ? "bg-accent-500" : "bg-primary-300"}`} aria-hidden>
        <span className={`absolute top-[2px] left-[2px] w-[27px] h-[27px] bg-white rounded-full shadow-sm motion-safe:transition-transform motion-safe:duration-200 ${on ? "translate-x-[20px]" : ""}`} />
      </span>
    </button>
  );
}
