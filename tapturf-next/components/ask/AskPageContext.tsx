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
  // A new array every render from the server page: compare the text, not the array.
  const questions = blog?.questions?.join("\n") ?? "";
  const charts = blog?.charts ?? false;
  useEffect(() => {
    setPageContext({
      turf: id && name ? { id, name } : null,
      city: city ?? null,
      blog: slug && title ? { slug, title, questions: questions ? questions.split("\n") : [], charts } : null,
    });
    return () => setPageContext({});
  }, [id, name, city, slug, title, questions, charts, setPageContext]);
  return null;
}
