import { CourtNearMe, courtNearMeMetadata } from "@/components/near/CourtNearMe";

// Pickleball courts near me (components/near/CourtNearMe.tsx). Prerendered in
// every build from the build-data step's rows; a day (an hour until 10 Nov),
// and every list post marks it stale (turf-data:india).
export const revalidate = 86400;

export function generateMetadata() {
  return courtNearMeMetadata("pickleball");
}

export default function PickleballCourtsNearMePage() {
  return <CourtNearMe slug="pickleball" />;
}
