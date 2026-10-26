// The PGlite that account_links.layered.mjs gives an existing check: right
// after the check runs its own migration file (LAYER_AFTER), it also applies
// support.sql (what the two account-links files need that the check's
// stand-ins may lack) and then 20261026_account_links.sql and
// 20261026_account_links_reads.sql from LAYER_MIG, so the check's later
// assertions run against the replaced function bodies. PGlite only.
import fs from "node:fs";

const { PGlite: Real } = await import(process.env.PGLITE_REAL);
const targets = (process.env.LAYER_AFTER ?? "").split(",").filter(Boolean).map((f) => fs.readFileSync(f, "utf8"));
const M = process.env.LAYER_MIG;
const support = fs.readFileSync(new URL("./support.sql", import.meta.url), "utf8");
const core = fs.readFileSync(`${M}/20261026_account_links.sql`, "utf8");
const reads = fs.readFileSync(`${M}/20261026_account_links_reads.sql`, "utf8");
let layers = 0;
process.on("exit", () => console.log(`LAYERED APPLIED\t${layers}`));

export class PGlite extends Real {
  async exec(sql, opts) {
    const r = await super.exec(sql, opts);
    if (targets.includes(sql)) {
      await super.exec(support);
      await super.exec(core);
      await super.exec(reads);
      await super.exec("set check_function_bodies = on;");
      layers++;
    }
    return r;
  }
}
