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
        className="w-full flex items-center justify-center gap-2 rounded-full bg-accent-500 hover:bg-accent-600 text-white text-[16px] font-semibold h-12 transition-colors"
      >
        <Plus className="w-5 h-5" strokeWidth={2.5} />
        Host a game here
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-center gap-2 rounded-full bg-primary-100 hover:bg-primary-200 text-primary-900 text-[17px] font-semibold h-12 mt-3 transition-colors"
    >
      <Plus className="w-5 h-5" strokeWidth={2.5} />
      Host a game here
    </button>
  );
}
