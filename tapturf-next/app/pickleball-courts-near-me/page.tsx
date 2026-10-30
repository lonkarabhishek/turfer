import { CourtNearMe, courtNearMeMetadata } from "@/components/near/CourtNearMe";

// Pickleball courts near me (components/near/CourtNearMe.tsx). Prerendered in
// every build from the build-data step's rows, refreshed hourly.
export const revalidate = 3600;

export function generateMetadata() {
  return courtNearMeMetadata("pickleball");
}

export default function PickleballCourtsNearMePage() {
  return <CourtNearMe slug="pickleball" />;
}
