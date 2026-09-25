import type { Metadata } from "next";
import { Suspense } from "react";
import { CreateGameFlow } from "@/components/game/CreateGameFlow";

export const metadata: Metadata = {
  title: "Create a Game",
  description: "Create a sports game and invite players to join. Football, cricket, basketball and more.",
};

export default function CreateGamePage() {
  // CreateGameFlow calls useSearchParams() to prefill the turf when
  // someone lands here from a "Create a game here" button on a turf
  // profile. That hook requires a Suspense boundary above it or the
  // whole route opts into CSR.
  return (
    <Suspense fallback={null}>
      <CreateGameFlow />
    </Suspense>
  );
}
