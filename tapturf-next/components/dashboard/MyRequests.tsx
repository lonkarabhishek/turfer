"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Clock, Check, X, Trash2 } from "lucide-react";
import { getMyRequests, cancelMyRequest } from "@/lib/queries/games";
import type { GameRequest } from "@/types/game";

export function MyRequests({ userId }: { userId: string }) {
  const [requests, setRequests] = useState<GameRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRequests();
  }, [userId]);

  const loadRequests = async () => {
    setLoading(true);
    const { data } = await getMyRequests(userId);
    setRequests(data);
    setLoading(false);
  };

  const handleCancel = async (requestId: string) => {
    await cancelMyRequest(requestId, userId);
    await loadRequests();
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border border-gray-200 rounded-xl p-4 animate-pulse">
            <div className="w-2/3 h-5 bg-gray-200 rounded mb-2" />
            <div className="w-1/3 h-4 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-gray-500 mb-4">No requests sent yet</p>
        <Link
          href="/games"
          className="inline-flex items-center gap-2 bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-full"
        >
          Browse Games
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((req) => (
        <div key={req.id} className="border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <Link href={`/game/${req.game_id}`} className="text-sm font-medium text-gray-900 hover:underline">
              View Game
            </Link>
            <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
              req.status === "pending" ? "bg-yellow-50 text-yellow-700" :
              req.status === "accepted" ? "bg-green-50 text-green-700" :
              "bg-red-50 text-red-600"
            }`}>
              {req.status === "pending" && <Clock className="w-3 h-3" />}
              {req.status === "accepted" && <Check className="w-3 h-3" />}
              {req.status === "declined" && <X className="w-3 h-3" />}
              {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
            </span>
          </div>

          {req.note && <p className="text-xs text-gray-500 mb-2">{req.note}</p>}

          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {new Date(req.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>

            {req.status === "pending" && (
              <button
                onClick={() => handleCancel(req.id)}
                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
              >
                <Trash2 className="w-3 h-3" />
                Cancel
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
