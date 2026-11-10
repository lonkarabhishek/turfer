import { escapeHtml } from "./format";
import { GROUP_DETAIL, type OffGroup } from "./types";

/**
 * The page the "Turn off these emails" link opens (/email/off): a small
 * page of its own, the same on every phone, kept out of search (noindex,
 * and the route's X-Robots-Tag). It says which emails the link turns off
 * and asks first, with a button (a POST: a mail app or a link checker that
 * opens the link changes nothing). Mobile first, inline styles, no
 * scripts, no images. Relative imports only (npm run test:email).
 */

export type OffState =
  | { state: "ask"; group: OffGroup; token: string }
  | { state: "done"; group: OffGroup }
  | { state: "bad" }
  | { state: "error"; token?: string };

/** Where all the switches are: the Me tab's Profile, its Emails block. */
export const MANAGE_PATH = "/dashboard?tab=profile#emails";

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** What the link turns off, as the email's own footer names it. */
export const OFF_NOUN: Record<OffGroup, string> = {
  requests: "join request emails",
  changes: "game change emails",
  reminders: "reminder emails",
  all: "all TapTurf emails",
};

export function offPage(s: OffState): { status: number; html: string } {
  const title =
    s.state === "ask" ? `Turn off ${OFF_NOUN[s.group]}?`
      : s.state === "done" ? "Done. They're off."
        : s.state === "bad" ? "This link doesn't work"
          : "Couldn't do that just now";
  const body =
    s.state === "ask"
      ? `<p class="lead">${escapeHtml(GROUP_DETAIL[s.group])}</p>
<form method="post" action="/email/off?t=${escapeHtml(encodeURIComponent(s.token))}">
<input type="hidden" name="t" value="${escapeHtml(s.token)}">
<button type="submit">Turn off</button>
</form>
<p class="small">Changed your mind? Just close this page.</p>`
      : s.state === "done"
        ? `<p class="lead">We won't send you ${escapeHtml(OFF_NOUN[s.group])} any more. Notifications in the app stay as they are.</p>
<p class="small">You can turn them back on any time on the Me tab.</p>`
        : s.state === "bad"
          ? `<p class="lead">It may have been cut short when it was copied. Open the link from the email again, or change your emails on the Me tab.</p>`
          : `<p class="lead">Please try again in a minute.</p>${
              s.token
                ? `<form method="post" action="/email/off?t=${escapeHtml(encodeURIComponent(s.token))}"><input type="hidden" name="t" value="${escapeHtml(s.token)}"><button type="submit">Try again</button></form>`
                : ""
            }`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer"><meta name="color-scheme" content="light">
<title>Emails | TapTurf</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#F3F4F6;color:#1D1D1F;font-family:${FONT};-webkit-text-size-adjust:100%}
main{max-width:480px;margin:0 auto;padding:24px 16px 40px}
.brand{display:inline-block;font-size:20px;font-weight:800;letter-spacing:-0.3px;color:#15803D;text-decoration:none;margin:0 4px 14px}
.card{background:#fff;border:1px solid #E5E7EB;border-radius:16px;padding:24px 20px}
h1{margin:0 0 10px;font-size:22px;line-height:1.3;font-weight:700}
.lead{margin:0 0 18px;font-size:16px;line-height:1.5;color:#3F3F46}
.small{margin:14px 0 0;font-size:14px;line-height:1.5;color:#6E6E73}
form{margin:0}
button{display:block;width:100%;min-height:48px;border:0;border-radius:999px;background:#15803D;color:#fff;font:700 16px/1.2 ${FONT};cursor:pointer}
button:focus-visible,a:focus-visible{outline:3px solid #16A34A;outline-offset:2px}
.manage{display:block;margin-top:16px;font-size:15px;font-weight:600;color:#166534}
footer{margin:18px 4px 0;font-size:13px;line-height:1.5;color:#6E6E73}
</style></head>
<body><main>
<a class="brand" href="/">TapTurf</a>
<div class="card">
<h1>${escapeHtml(title)}</h1>
${body}
<a class="manage" href="${MANAGE_PATH}">Manage all your emails on the Me tab</a>
</div>
<footer>Questions? Write to info@tapturf.in.</footer>
</main></body></html>`;
  return { status: s.state === "bad" ? 400 : s.state === "error" ? 503 : 200, html };
}
