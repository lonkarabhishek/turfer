import type { Metadata } from "next";
import { GamesListingClient } from "@/components/game/GamesListingClient";

export const metadata: Metadata = {
  title: "Join a Game in Nashik",
  description: "Find and join sports games in Nashik. Cricket, football, basketball and more. Request to join open games near you.",
};

export default function GamesPage() {
  return <GamesListingClient />;
}
