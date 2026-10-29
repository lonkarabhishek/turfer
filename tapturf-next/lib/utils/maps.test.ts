import { test } from "node:test";
import assert from "node:assert/strict";
import { mapEmbedSrc } from "./maps";

test("mapEmbedSrc frames only what Google lets us frame", () => {
  const place = "https://www.google.com/maps/place/Legends+13+box+turf/data=!4m2!3m1!1s0x0";
  // The point wins over any link.
  assert.equal(mapEmbedSrc({ embedLink: place, lat: 18.46, lng: 73.85 }), "https://www.google.com/maps?q=18.46,73.85&z=16&hl=en&output=embed");
  // A /maps/place/ link or a shortlink is never framed: the address instead, else nothing.
  assert.equal(mapEmbedSrc({ embedLink: place, address: "Dhankawadi, Pune" }), "https://www.google.com/maps?q=Dhankawadi%2C%20Pune&output=embed");
  assert.equal(mapEmbedSrc({ embedLink: "https://maps.app.goo.gl/abc" }), null);
  assert.equal(mapEmbedSrc({ embedLink: place }), null);
  // Embeddable forms pass through, from a bare URL or an iframe snippet.
  const embed = "https://www.google.com/maps/embed?pb=!1m18";
  assert.equal(mapEmbedSrc({ embedLink: embed }), embed);
  assert.equal(mapEmbedSrc({ embedLink: `<iframe src="${embed}" width="600"></iframe>` }), embed);
  assert.equal(mapEmbedSrc({ embedLink: "https://maps.google.com/maps?q=x&output=embed" }), "https://maps.google.com/maps?q=x&output=embed");
  assert.equal(mapEmbedSrc({}), null);
});
