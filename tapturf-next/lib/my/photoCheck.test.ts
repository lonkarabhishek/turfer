import { test } from "node:test";
import assert from "node:assert/strict";
import { CHECK_CHUNK, NOT_SAME, chunks, judgeFailure, toCheckItems, verdictsFor } from "./photoCheck";

const item = (id: string) => ({ id, url: `https://x.in/${id}.webp`, cardUrl: `https://x.in/${id}-card.webp` });
const items = ["a", "b", "c", "d"].map(item);
const review = (index: number, usable: boolean, same = true, note = usable ? "Clear shot of the turf" : "A price list") =>
  ({ index, usable, same, quality: usable ? 4 : 1, shows: usable ? "pitch" : "logo_or_poster", note });

test("verdicts: matched by place in the call", () => {
  const v = verdictsFor(items.slice(0, 3), [review(1, false), review(0, true), review(2, true, false, "Fine")]);
  assert.deepEqual(v, [
    { id: "a", outcome: "judged", usable: true, quality: 4, shows: "pitch", note: "Clear shot of the turf" },
    { id: "b", outcome: "judged", usable: false, quality: 1, shows: "logo_or_poster", note: "A price list" },
    { id: "c", outcome: "judged", usable: false, quality: 4, shows: "pitch", note: NOT_SAME },
  ]);
});

test("verdicts: a card that isn't the photo holds it, however good it looks", () => {
  assert.equal(verdictsFor([items[0]], [review(0, true, false)])[0].usable, false);
});

test("verdicts: the judge refusing holds every photo it was sent, never passes one", () => {
  assert.deepEqual(verdictsFor(items.slice(0, 2), null, true), [
    { id: "a", outcome: "refused" },
    { id: "b", outcome: "refused" },
  ]);
  assert.deepEqual(verdictsFor(items.slice(0, 1), [review(0, true)], true), [{ id: "a", outcome: "refused" }], "even with an answer");
});

test("verdicts: a call that answered nothing about a photo marks it unanswered (tried again, then held)", () => {
  assert.deepEqual(verdictsFor(items.slice(0, 2), null), [
    { id: "a", outcome: "unanswered" },
    { id: "b", outcome: "unanswered" },
  ]);
  assert.deepEqual(
    verdictsFor(items.slice(0, 2), [review(5, true), review(1, true)]).map((v) => [v.id, v.outcome]),
    [["a", "unanswered"], ["b", "judged"]],
    "an answer for a photo we didn't send is ignored",
  );
  assert.equal(verdictsFor([items[0]], [{ ...review(0, true), same: undefined as unknown as boolean }])[0].outcome, "unanswered", "half an answer is none");
});

test("verdicts: quality kept between 1 and 5, notes kept short", () => {
  const [v] = verdictsFor([items[0]], [{ ...review(0, true), quality: 9.6, note: "x".repeat(500) }]);
  assert.equal(v.quality, 5);
  assert.equal(v.note?.length, 200);
  assert.equal(verdictsFor([items[0]], [{ ...review(0, true), quality: Number.NaN }])[0].quality, 1);
});

test("judgeFailure: only an image the API can't read is the photo's fault", () => {
  assert.equal(judgeFailure({ status: 400, message: "Could not process image" }), "bad_image");
  assert.equal(judgeFailure({ status: 400, message: "messages.0.content: invalid field" }), "down", "our own mistake blames no photo");
  assert.equal(judgeFailure({ status: 529, message: "Overloaded" }), "down");
  assert.equal(judgeFailure({ status: 429, message: "rate limited image" }), "down");
  assert.equal(judgeFailure(new Error("fetch failed")), "down");
  assert.equal(judgeFailure(null), "down");
});

test("chunks of three photos (six images)", () => {
  assert.equal(CHECK_CHUNK, 3);
  assert.deepEqual(chunks([1, 2, 3, 4, 5, 6, 7]).map((c) => c.length), [3, 3, 1]);
  assert.deepEqual(chunks([]), []);
});

test("toCheckItems", () => {
  assert.deepEqual(
    toCheckItems({ ok: true, items: [{ id: "a", url: "u", card_url: "c" }, { id: "b", url: "u" }, { url: "u", card_url: "c" }, null, { id: "c", url: "", card_url: "c" }] }),
    [{ id: "a", url: "u", cardUrl: "c" }],
  );
  assert.deepEqual(toCheckItems({ error: "forbidden" }), []);
  assert.deepEqual(toCheckItems(null), []);
});
