import type { Metadata } from "next";
import { CreateGameFlow } from "@/components/game/CreateGameFlow";

export const metadata: Metadata = {
  title: "Create a Game",
  description: "Create a sports game and invite players to join. Football, cricket, basketball and more.",
};

export default function CreateGamePage() {
  return <CreateGameFlow />;
}
