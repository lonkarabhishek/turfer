import { toolUseOf, type ToolUse } from "../tools/usage";

/**
 * GA4 events for the free cricket tools. Same gtag the rest of the
 * site uses; no new provider. Every event carries the tool name. A
 * tool's started and finished events are also counted for the admin
 * (lib/tools/usage.ts): only the tool, the event and a sport tag.
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
  const use = toolUseOf(event, tool, params);
  if (use) countUse(use);
}

/** One use to /api/tools/use, sent so it survives the page closing; never in the way of the tool. */
function countUse(use: ToolUse) {
  try {
    const body = JSON.stringify(use);
    if (navigator.sendBeacon?.("/api/tools/use", new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/tools/use", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
  } catch {
    /* ignore */
  }
}
