// node:assert/strict for account_links.layered.mjs: a failed assertion is
// recorded and the check goes on, so one run shows every assertion the
// account-links migrations change. The list is printed when the process
// exits, one "LAYERED FAILURE<TAB>message<TAB>actual<TAB>expected" line each.
import real from "node:assert/strict";

const failures = [];
const short = (v) => {
  try {
    const s = JSON.stringify(v);
    return s && s.length > 300 ? `${s.slice(0, 300)}...` : String(s);
  } catch {
    return String(v);
  }
};
const record = (e) => failures.push([e.message.split("\n")[0], short(e.actual), short(e.expected)].join("\t"));
const soft = (f) => {
  if (typeof f !== "function") return f;
  return (...a) => {
    try {
      const r = f(...a);
      return r && typeof r.then === "function" ? r.catch(record) : r;
    } catch (e) {
      record(e);
    }
  };
};
const assert = soft(real.ok);
for (const k of Object.getOwnPropertyNames(real)) {
  if (typeof real[k] === "function" && /^[a-z]/.test(k)) assert[k] = soft(real[k]);
}
process.on("exit", () => {
  for (const f of failures) console.log(`LAYERED FAILURE\t${f}`);
});
export default assert;
