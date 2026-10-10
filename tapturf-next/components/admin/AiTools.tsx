"use client";

import { ClipboardCheck, MessageSquareQuote } from "lucide-react";
import { BatchTool } from "./BatchTool";

/** Admin: listing gap checker for data ops. */
export function ListingCheckTool() {
  return (
    <BatchTool
      title="Listing checker"
      icon={<ClipboardCheck className="w-4 h-4 text-accent-600" />}
      blurb="Reads each turf like an editor and flags mismatches (name says cricket, sports doesn't), gaps (no hours, no rate) and advert-style text. Reports only; nothing is edited."
      endpoint="/api/admin/listing"
      flaggedLabel="flagged"
      link={{ href: "/admin/listing", label: "See flagged turfs" }}
    />
  );
}

/** Admin: "what players say" summaries from written reviews. */
export function ReviewSummaryTool() {
  return (
    <BatchTool
      title="What players say"
      icon={<MessageSquareQuote className="w-4 h-4 text-accent-600" />}
      blurb="Two sentences per turf from its written Google and TapTurf reviews, shown on the turf page. Only turfs with two or more written reviews; remade when a newer review arrives."
      endpoint="/api/admin/reviews/summary"
      unit="turfs with reviews"
    />
  );
}
