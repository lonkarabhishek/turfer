import type { Metadata } from "next";
import { mapMetadata } from "@/lib/seo/mapMeta";
import { MapExplorer } from "@/components/map/MapExplorer";

// The map of every turf and open game. Static: the server sends the frame
// and reads nothing (no database, no query string); the browser reads the
// view from the URL and the turfs and games from /api/map/*. Not indexed
// and not in sitemap.xml for now (lib/seo/mapMeta.ts).
export const metadata: Metadata = mapMetadata();

export default function MapPage() {
  return <MapExplorer />;
}
