import type { Metadata } from "next";
import { GameDetailClient } from "@/components/game/GameDetailClient";

export const metadata: Metadata = {
  title: "Game Details",
};

export default async function GameDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GameDetailClient gameId={id} />;
}
