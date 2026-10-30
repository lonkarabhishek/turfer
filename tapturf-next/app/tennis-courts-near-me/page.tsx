import { CourtNearMe, courtNearMeMetadata } from "@/components/near/CourtNearMe";

// Tennis courts near me (components/near/CourtNearMe.tsx). Prerendered in
// every build from the build-data step's rows, refreshed hourly.
export const revalidate = 3600;

export function generateMetadata() {
  return courtNearMeMetadata("tennis");
}

export default function TennisCourtsNearMePage() {
  return <CourtNearMe slug="tennis" />;
}
