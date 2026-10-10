"use client";

import { Image as ImageIcon } from "lucide-react";
import { BatchTool } from "./BatchTool";

/** Admin: the AI cover-photo pass, on the shared batch runner. */
export function CoverPhotoTool() {
  return (
    <BatchTool
      title="Cover photos by Claude"
      icon={<ImageIcon className="w-4 h-4 text-accent-600" />}
      blurb="Picks the photo that best shows the ground for each turf and hides logos, screenshots and blur. Haiku 5.5, about half a paisa per photo."
      endpoint="/api/admin/covers"
      flaggedLabel="photos hidden"
    />
  );
}
