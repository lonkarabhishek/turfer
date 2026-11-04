import { test } from "node:test";
import assert from "node:assert/strict";
import { createHostLookup, findHostUsername, searchName, type HostLookupDeps, type PlayerHit } from "./hostProfile";

const RAVI = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const OTHER_RAVI = "aaaaaaaa-aaaa-4aaa-8aaa-000000000002";
const ASHA = "aaaaaaaa-aaaa-4aaa-8aaa-000000000003";

/** A stand-in database: shown usernames and their accounts, and what players_search finds. */
function fakeDb(people: { id: string; u: string; name: string }[]) {
  const calls: string[] = [];
  const deps: HostLookupDeps = {
    async search(q) {
      calls.push(`search:${q}`);
      const l = q.toLowerCase();
      return people.filter((p) => p.name.toLowerCase().includes(l) || p.u.startsWith(l)).slice(0, 8).map(({ u, name }): PlayerHit => ({ u, name }));
    },
    async owner(u) {
      calls.push(`owner:${u}`);
      return people.find((p) => p.u === u)?.id ?? null;
    },
  };
  return { deps, calls };
}

test("a username only when profile_owner says it is the host's account", async () => {
  const { deps } = fakeDb([
    { id: OTHER_RAVI, u: "ravi", name: "Ravi Kumar" },
    { id: RAVI, u: "ravi_k", name: "Ravi Kumar" },
    { id: ASHA, u: "asha", name: "Asha Rao" },
  ]);
  assert.equal(await findHostUsername({ id: RAVI, name: "Ravi Kumar" }, deps), "ravi_k", "the namesake is checked and passed over");
  assert.equal(await findHostUsername({ id: RAVI, name: "  ravi   KUMAR " }, deps), "ravi_k", "same name, other spacing and case");
  assert.equal(await findHostUsername({ id: ASHA, name: "Asha R." }, deps), null, "renamed since the game: no link, never a guess");
  assert.equal(await findHostUsername({ id: "aaaaaaaa-aaaa-4aaa-8aaa-00000000000f", name: "Ravi Kumar" }, deps), null, "no shown profile");
  assert.equal(await findHostUsername({ id: RAVI, name: "Player" }, deps), null, "the stand-in name is not looked up");
});

test("at most 3 namesakes are checked; a name that only contains the host's is not one", async () => {
  const people = Array.from({ length: 6 }, (_, i) => ({ id: `aaaaaaaa-aaaa-4aaa-8aaa-00000000010${i}`, u: `ravi${i}x`, name: i === 5 ? "Ravi Kumar Patil" : "Ravi Kumar" }));
  const { deps, calls } = fakeDb(people);
  assert.equal(await findHostUsername({ id: people[4].id, name: "Ravi Kumar" }, deps), null);
  assert.deepEqual(calls.filter((c) => c.startsWith("owner:")), ["owner:ravi0x", "owner:ravi1x", "owner:ravi2x"]);
});

test("searchName: what players_search is asked, at most 30 characters", () => {
  assert.equal(searchName(" Ravi   Kumar "), "Ravi Kumar");
  assert.equal(searchName("A"), null);
  assert.equal(searchName("player"), null);
  assert.equal(searchName(null), null);
  assert.equal(searchName("@ravi"), null);
  assert.equal([...searchName("Venkata Subrahmanya Lakshminarayana Iyer")!].length <= 30, true);
});

test("remembered for the TTL per process; a failed lookup is not; a slow one does not hold the page", async () => {
  let t = 1_000_000;
  const { deps, calls } = fakeDb([{ id: RAVI, u: "ravi_k", name: "Ravi Kumar" }]);
  const lookup = createHostLookup({ ...deps, now: () => t }, { ttlMs: 60_000 });
  assert.deepEqual([...(await lookup([{ id: RAVI, name: "Ravi Kumar" }, { id: RAVI, name: "Ravi Kumar" }, { id: "not-a-uuid", name: "X Y" }]))], [[RAVI, "ravi_k"]]);
  assert.equal(calls.length, 2, "one search, one owner check");
  await lookup([{ id: RAVI, name: "Ravi Kumar" }]);
  assert.equal(calls.length, 2, "remembered");
  t += 61_000;
  await lookup([{ id: RAVI, name: "Ravi Kumar" }]);
  assert.equal(calls.length, 4, "asked again after the TTL");

  let down = true;
  const warnings: string[] = [];
  const flaky = createHostLookup({
    search: async (q) => (down ? "unavailable" : deps.search(q)),
    owner: deps.owner,
    now: () => t,
    warn: (m) => warnings.push(m),
  });
  assert.equal((await flaky([{ id: RAVI, name: "Ravi Kumar" }])).size, 0);
  assert.equal(warnings.length, 1);
  down = false;
  assert.equal((await flaky([{ id: RAVI, name: "Ravi Kumar" }])).get(RAVI), "ravi_k", "the failure was not remembered");

  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  const slow = createHostLookup(
    { search: async (q) => (await gate, deps.search(q)), owner: deps.owner, now: () => t, sleep: () => Promise.resolve() },
    { budgetMs: 1 },
  );
  assert.equal((await slow([{ id: RAVI, name: "Ravi Kumar" }])).size, 0, "past the budget: the game page's url this time");
  release();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal((await slow([{ id: RAVI, name: "Ravi Kumar" }])).get(RAVI), "ravi_k", "the late answer was kept for the next render");
});

test("at most MAX_HOSTS hosts are asked per call", async () => {
  const { deps, calls } = fakeDb([]);
  const lookup = createHostLookup(deps, { maxHosts: 3 });
  await lookup(Array.from({ length: 10 }, (_, i) => ({ id: `aaaaaaaa-aaaa-4aaa-8aaa-0000000002${String(i).padStart(2, "0")}`, name: `Host ${i}` })));
  assert.equal(calls.filter((c) => c.startsWith("search:")).length, 3);
});
