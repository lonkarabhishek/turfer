"use client";

import { useEffect } from "react";
import { useAsk, type PageContext } from "./AskProvider";

/** Tells the chat what the player is looking at. Render once per page that has context. */
export function AskPageContext({ turf, city, blog }: PageContext) {
  const { setPageContext } = useAsk();
  const id = turf?.id ?? null;
  const name = turf?.name ?? null;
  const slug = blog?.slug ?? null;
  const title = blog?.title ?? null;
  useEffect(() => {
    setPageContext({ turf: id && name ? { id, name } : null, city: city ?? null, blog: slug && title ? { slug, title } : null });
    return () => setPageContext({});
  }, [id, name, city, slug, title, setPageContext]);
  return null;
}
