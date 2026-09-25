"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

interface CreateGameHereButtonProps {
  turfId: string;
  turfName: string;
  variant?: "sidebar" | "inline";
}

/**
 * "Create a game here" CTA on a turf profile — used to exist on the
 * old Vite pages and got dropped in the Next.js port. Prefills the
 * create-game wizard with this turf via query params so the visitor
 * doesn't have to search for it again inside the flow.
 * If they're signed out, pops the login modal first with a
 * post-login next=/game/create so they land straight in the wizard.
 */
export function CreateGameHereButton({
  turfId,
  turfName,
  variant = "sidebar",
}: CreateGameHereButtonProps) {
  const router = useRouter();
  const { user, login } = useAuth();

  const targetUrl = `/game/create?turf=${encodeURIComponent(turfId)}&turfName=${encodeURIComponent(turfName)}`;

  const onClick = () => {
    if (!user) {
      login();
      return;
    }
    router.push(targetUrl);
  };

  if (variant === "inline") {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-primary-300 bg-white text-primary-800 hover:border-primary-500 hover:bg-primary-50 text-sm font-semibold py-3 transition-colors"
      >
        <Plus className="w-4 h-4" strokeWidth={2.5} />
        Create a game here
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-center gap-2 rounded-xl border border-primary-200 bg-primary-50 hover:bg-primary-100 text-primary-800 hover:border-primary-300 font-semibold py-3 mt-3 transition-colors"
    >
      <Plus className="w-4 h-4" strokeWidth={2.5} />
      Create a game here
    </button>
  );
}
