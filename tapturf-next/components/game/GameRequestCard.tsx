"use client";

import { useState } from "react";
import { User, Check, X } from "lucide-react";
import type { GameRequest } from "@/types/game";

interface Props {
  request: GameRequest;
  onAccept: () => void;
  onDecline: () => void;
}

export function GameRequestCard({ request, onAccept, onDecline }: Props) {
  const [acting, setActing] = useState(false);

  const handleAccept = async () => {
    setActing(true);
    await onAccept();
    setActing(false);
  };

  const handleDecline = async () => {
    setActing(true);
    await onDecline();
    setActing(false);
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
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
          request.status === "accepted" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
        }`}>
          {request.status === "accepted" ? "Accepted" : "Declined"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between p-3 border border-gray-200 rounded-xl">
      <div className="flex items-center gap-3">
        {request.requester_avatar ? (
          <img src={request.requester_avatar} alt="" className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
            <User className="w-4 h-4 text-gray-500" />
          </div>
        )}
        <div>
          <p className="text-sm font-medium text-gray-900">{request.requester_name}</p>
          {request.note && <p className="text-xs text-gray-500 mt-0.5">{request.note}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleDecline}
          disabled={acting}
          className="p-2 rounded-full border border-gray-200 hover:bg-red-50 hover:border-red-200 transition-colors disabled:opacity-50"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
        <button
          onClick={handleAccept}
          disabled={acting}
          className="p-2 rounded-full bg-gray-900 hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          <Check className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
  );
}
