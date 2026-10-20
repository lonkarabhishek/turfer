/**
 * GA4 events for the free cricket tools. Same gtag the rest of the
 * site uses; no new provider. Every event carries the tool name.
 */
/** tool_action: a milestone inside a longer tool session, like an over or a wicket in the live scorer. */
export type ToolEvent = "tool_opened" | "tool_used" | "tool_result_generated" | "tool_cta_clicked" | "tool_action";

export function trackTool(event: ToolEvent, tool: string, params: Record<string, string | number | boolean> = {}) {
  if (typeof window === "undefined") return;
  try {
    const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
    gtag?.("event", event, { tool, ...params });
  } catch {
    /* ignore */
  }
}
