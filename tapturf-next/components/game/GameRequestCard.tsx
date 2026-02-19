"use client";

import { useState } from "react";
import { User, Check, X, Loader2 } from "lucide-react";
import type { GameRequest } from "@/types/game";

interface Props {
  request: GameRequest;
  onAccept: () => void;
  onDecline: () => void;
  compact?: boolean;
}

export function GameRequestCard({ request, onAccept, onDecline, compact }: Props) {
  const [acting, setActing] = useState<"accept" | "decline" | null>(null);

  const handleAccept = async () => {
    setActing("accept");
    await onAccept();
    setActing(null);
  };

  const handleDecline = async () => {
    setActing("decline");
    await onDecline();
    setActing(null);
  };

  if (request.status !== "pending") {
    return (
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
        <div className="flex items-center gap-3">
          {request.requester_avatar ? (
            <img src={request.requester_avatar} alt="" className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
              <User className="w-4 h-4 text-gray-500" />
            </div>
          )}
          <span className="text-sm text-gray-700">{request.requester_name}</span>
        </div>
        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
          request.status === "accepted"
            ? "bg-green-100 text-green-700"
            : "bg-red-100 text-red-600"
        }`}>
          {request.status === "accepted" ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
          {request.status === "accepted" ? "Accepted" : "Declined"}
        </span>
      </div>
    );
  }

  // Compact mode for desktop sidebar
  if (compact) {
    return (
      <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-gray-200">
        <div className="flex items-center gap-2 min-w-0">
          {request.requester_avatar ? (
            <img src={request.requester_avatar} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
              <User className="w-3.5 h-3.5 text-primary-600" />
            </div>
          )}
          <span className="text-sm font-medium text-gray-900 truncate">{request.requester_name}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          <button
            onClick={handleDecline}
            disabled={acting !== null}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-red-50 hover:bg-red-100 border border-red-200 transition-colors disabled:opacity-50"
          >
            {acting === "decline" ? <Loader2 className="w-3 h-3 text-red-500 animate-spin" /> : <X className="w-3.5 h-3.5 text-red-500" />}
          </button>
          <button
            onClick={handleAccept}
            disabled={acting !== null}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-green-500 hover:bg-green-600 transition-colors disabled:opacity-50"
          >
            {acting === "accept" ? <Loader2 className="w-3 h-3 text-white animate-spin" /> : <Check className="w-3.5 h-3.5 text-white" />}
          </button>
        </div>
      </div>
    );
  }

  // Full mode
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        {request.requester_avatar ? (
          <img src={request.requester_avatar} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0 ring-2 ring-primary-100" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center flex-shrink-0">
            <User className="w-5 h-5 text-white" />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{request.requester_name}</p>
          {request.note && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">&ldquo;{request.note}&rdquo;</p>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleAccept}
              disabled={acting !== null}
              className="flex-1 flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors disabled:opacity-50"
            >
              {acting === "accept" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Accept
                </>
              )}
            </button>
            <button
              onClick={handleDecline}
              disabled={acting !== null}
              className="flex-1 flex items-center justify-center gap-1.5 bg-white hover:bg-red-50 text-red-500 text-xs font-bold py-2 px-3 rounded-lg border border-red-200 hover:border-red-300 transition-colors disabled:opacity-50"
            >
              {acting === "decline" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <X className="w-3.5 h-3.5" />
                  Decline
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
