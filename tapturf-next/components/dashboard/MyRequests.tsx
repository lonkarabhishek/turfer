"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Clock, Check, X, Trash2, ChevronRight, MessageSquare, Gamepad2 } from "lucide-react";
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
        <div className="w-14 h-14 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <MessageSquare className="w-6 h-6 text-primary-400" />
        </div>
        <p className="text-sm font-medium text-gray-900 mb-1">No requests yet</p>
        <p className="text-sm text-gray-500 mb-5">Find a game and send a join request</p>
        <Link
          href="/games"
          className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-bold px-5 py-2.5 rounded-full transition-colors"
        >
          <Gamepad2 className="w-4 h-4" />
          Browse Games
        </Link>
      </div>
    );
  }

  const pending = requests.filter(r => r.status === "pending");
  const handled = requests.filter(r => r.status !== "pending");

  return (
    <div className="space-y-4">
      {/* Pending requests first */}
      {pending.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Pending ({pending.length})</p>
          <div className="space-y-2">
            {pending.map((req) => (
              <div key={req.id} className="border-2 border-yellow-200 bg-yellow-50/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <Link href={`/game/${req.game_id}`} className="text-sm font-semibold text-gray-900 hover:text-primary-600 flex items-center gap-1 transition-colors">
                    View Game <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                  <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700">
                    <Clock className="w-3 h-3" />
                    Pending
                  </span>
                </div>

                {req.note && <p className="text-xs text-gray-600 mb-2 italic">&ldquo;{req.note}&rdquo;</p>}

                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    {new Date(req.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <button
                    onClick={() => handleCancel(req.id)}
                    className="flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Handled requests */}
      {handled.length > 0 && (
        <div>
          {pending.length > 0 && (
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Previous</p>
          )}
          <div className="space-y-2">
            {handled.map((req) => (
              <div key={req.id} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <Link href={`/game/${req.game_id}`} className="text-sm font-medium text-gray-900 hover:text-primary-600 flex items-center gap-1 transition-colors">
                    View Game <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                  <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                    req.status === "accepted" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                  }`}>
                    {req.status === "accepted" ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                    {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                  </span>
                </div>

                {req.note && <p className="text-xs text-gray-500 mb-1">{req.note}</p>}

                <span className="text-xs text-gray-400">
                  {new Date(req.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
