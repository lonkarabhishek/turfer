"use client";

import { useAuth } from "./AuthProvider";
import { X, CheckCircle } from "lucide-react";

export function WelcomeToast() {
  const { welcomeMessage, dismissWelcome } = useAuth();

  if (!welcomeMessage) return null;

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-slide-down">
      <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-2xl shadow-elevated px-5 py-3.5 min-w-[240px]">
        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
        <span className="text-sm font-semibold text-gray-900">{welcomeMessage}</span>
        <button
          onClick={dismissWelcome}
          className="ml-auto p-0.5 rounded-full hover:bg-gray-100 transition-colors"
        >
          <X className="w-3.5 h-3.5 text-gray-400" />
        </button>
      </div>
    </div>
  );
}
