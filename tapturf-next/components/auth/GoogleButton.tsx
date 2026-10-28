import { Loader2 } from "lucide-react";

/**
 * "Continue with Google" in Google's own dark pill (the look of Google's
 * filled_black button, from their branding guidelines: #131314 fill,
 * #8E918F edge, #E3E3E3 label, the colour G on a white disc at the left
 * edge, the label centred in the rest). Drawn here rather than with
 * Google's script, so nothing loads from Google before the visitor taps
 * it (the cookie banner's rule) and the sign-in stays the redirect the
 * account rules expect.
 */
export function GoogleButton({
  onClick,
  busy = false,
  disabled = false,
  label = "Continue with Google",
}: {
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      aria-busy={busy || undefined}
      className="press-tight w-full flex items-center h-12 pl-1 pr-4 rounded-full bg-[#131314] hover:bg-[#25262a] border border-[#8E918F] text-[#E3E3E3] text-[15px] font-medium tracking-[0.25px] transition-colors disabled:opacity-60 focus-neon cursor-pointer"
    >
      <span className="w-10 h-10 shrink-0 rounded-full bg-white flex items-center justify-center" aria-hidden>
        {busy ? <Loader2 className="w-[18px] h-[18px] animate-spin text-[#5f6368]" /> : <GoogleG />}
      </span>
      {/* Centred in the whole pill, not just the space after the disc. */}
      <span className="flex-1 text-center pr-6 truncate">{busy ? "Opening Google…" : label}</span>
    </button>
  );
}

/** Google's four-colour G. */
export function GoogleG({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}
