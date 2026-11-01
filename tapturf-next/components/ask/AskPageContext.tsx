"use client";

import { useEffect } from "react";
import { useAsk, type PageContext } from "./AskProvider";

/** Tells the chat what the player is looking at. Render once per page that has context. */
export function AskPageContext({ turf, city, blog, listing = false, live }: PageContext) {
  const { setPageContext } = useAsk();
  const id = turf?.id ?? null;
  const name = turf?.name ?? null;
  const slug = blog?.slug ?? null;
  const title = blog?.title ?? null;
  // A new array every render from the server page: compare the text, not the array.
  const questions = blog?.questions?.join("\n") ?? "";
  const charts = blog?.charts ?? false;
  const liveCode = live?.code ?? null;
  const liveChips = live?.chips.join("\n") ?? "";
  useEffect(() => {
    setPageContext({
      turf: id && name ? { id, name } : null,
      city: city ?? null,
      blog: slug && title ? { slug, title, questions: questions ? questions.split("\n") : [], charts } : null,
      listing,
      // Only on a live score page: everywhere else the context is as it was.
      ...(liveCode ? { live: { code: liveCode, chips: liveChips ? liveChips.split("\n") : [] } } : {}),
    });
    return () => setPageContext({});
  }, [id, name, city, slug, title, questions, charts, listing, liveCode, liveChips, setPageContext]);
  return null;
}
