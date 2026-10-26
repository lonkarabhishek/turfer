import { CityPick } from "@/components/city/CityPick";
import { isKnownCity } from "@/lib/city";
import { pickCities, pickMetadata } from "@/app/c/pick/meta";

// The pick screen for / (see layout.tsx). Static: "error" fails
// the build if anything here ever reads the request.
export const dynamic = "error";
export const dynamicParams = false;

export function generateMetadata() {
  return pickMetadata("/");
}

export default async function PickHomePage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  const detected = isKnownCity(city) ? city : null;
  return <CityPick detected={detected} page="/" cities={await pickCities()} />;
}
