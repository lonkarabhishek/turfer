import { CityPick } from "@/components/city/CityPick";
import { isKnownCity } from "@/lib/city";
import { pickCities, pickMetadata } from "@/app/c/pick/meta";

// The pick screen for /games (see ../layout.tsx). Static: "error" fails
// the build if anything here ever reads the request.
export const dynamic = "error";
export const dynamicParams = false;

export function generateMetadata() {
  return pickMetadata("/games");
}

export default async function PickGamesPage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  const detected = isKnownCity(city) ? city : null;
  return <CityPick detected={detected} page="/games" cities={await pickCities()} />;
}
