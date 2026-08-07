"use client";

import { useAuth } from "./AuthProvider";
import { Check } from "lucide-react";

export function WelcomeToast() {
  const { welcomeMessage } = useAuth();

  if (!welcomeMessage) return null;

  return (
    <div
      className="fixed top-6 left-1/2 -translate-x-1/2 z-[60] pointer-events-none"
      aria-live="polite"
    >
      <div className="relative animate-welcome-pop">
        {/* Soft green halo */}
        <div
          className="absolute inset-0 blur-2xl bg-accent-400/40 rounded-full"
          aria-hidden
        />

        <div className="relative flex items-center gap-3 bg-primary-800 rounded-full pl-2 pr-5 py-2 shadow-elevated">
          <span className="w-8 h-8 rounded-full bg-accent-500 flex items-center justify-center shadow-neon shrink-0">
            <Check className="w-5 h-5 text-white" strokeWidth={3} />
          </span>
          <span className="text-[15px] font-semibold text-white whitespace-nowrap">
            {welcomeMessage}
          </span>
        </div>
      </div>

      <style jsx>{`
        @keyframes welcome-pop {
          0%   { opacity: 0; transform: translateY(-24px) scale(0.85); }
          50%  { opacity: 1; transform: translateY(4px)   scale(1.04); }
          70%  { transform: translateY(-2px) scale(0.99); }
          100% { opacity: 1; transform: translateY(0)     scale(1); }
        }
        .animate-welcome-pop {
          animation: welcome-pop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
      `}</style>
    </div>
  );
}
