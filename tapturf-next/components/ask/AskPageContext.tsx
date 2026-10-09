"use client";

import { useEffect } from "react";
import { useAsk, type PageContext } from "./AskProvider";

/** Tells the chat what the player is looking at. Render once per page that has context. */
export function AskPageContext({ turf, city }: PageContext) {
  const { setPageContext } = useAsk();
  const id = turf?.id ?? null;
  const name = turf?.name ?? null;
  useEffect(() => {
    setPageContext({ turf: id && name ? { id, name } : null, city: city ?? null });
    return () => setPageContext({});
  }, [id, name, city, setPageContext]);
  return null;
}
