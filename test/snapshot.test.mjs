import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ratingFor, toSnapshot } from "../src/content/snapshot.ts";

const good = { title: "Humid", artist: "Moody Good", album: "Album", artwork: [{ src: "https://i.ytimg.com/a.jpg", sizes: "320x180" }], playbackState: "playing" };

describe("what the content script accepts from the page", () => {
  it("is nothing for a page that plays nothing, or says something that is not a reading", () => {
    for (const reading of [null, undefined, "text", 5, [], { title: "", artist: "" }, {}]) assert.equal(toSnapshot(reading), null, JSON.stringify(reading));
  });

  it("passes a good reading through unchanged", () => {
    assert.deepEqual(toSnapshot(good), good);
  });

  it("does not trust the page: wrong types become empty, not errors", () => {
    const snapshot = toSnapshot({ title: "Humid", artist: 7, album: { x: 1 }, artwork: "nope", playbackState: "exploding" });

    assert.equal(snapshot.artist, "");
    assert.equal(snapshot.album, "");
    assert.deepEqual(snapshot.artwork, []);
    assert.equal(snapshot.playbackState, "none");
  });

  it("cuts everything to what the Host accepts, so nothing is cut again over there", () => {
    const artwork = Array.from({ length: 20 }, (_, i) => ({ src: `https://i.ytimg.com/${i}.jpg`, sizes: "x".repeat(100) }));
    artwork.push({ src: "https://i.ytimg.com/" + "a".repeat(3000), sizes: "" }, { src: "", sizes: "" }, null, "text", { src: 5 });

    const snapshot = toSnapshot({ ...good, title: "t".repeat(2000), artwork });

    assert.equal(snapshot.title.length, 512);
    assert.equal(snapshot.artwork.length, 8);
    assert.ok(snapshot.artwork.every((a) => a.sizes.length <= 32 && a.src.length <= 2048 && a.src !== ""));
  });
});

describe("the like and dislike buttons", () => {
  it("are offered with the rating the page shows", () => {
    for (const rating of ["liked", "disliked", "none"]) {
      const snapshot = toSnapshot({ ...good, rating });

      assert.equal(snapshot.rating, rating);
      assert.deepEqual(snapshot.capabilities, ["rating", "dislike"]);
    }
  });

  it("are not offered while the page does not say what the rating is, or says something unknown", () => {
    for (const rating of [undefined, null, "", "love", 5]) {
      const snapshot = toSnapshot({ ...good, rating });

      assert.equal(snapshot.rating, undefined, String(rating));
      assert.equal(snapshot.capabilities, undefined, String(rating));
    }
  });
});

describe("a request from the Host", () => {
  it("means a rating for like, dislike and clear, and nothing for anything else", () => {
    assert.equal(ratingFor("like"), "liked");
    assert.equal(ratingFor("dislike"), "disliked");
    assert.equal(ratingFor("clear"), "none");
    for (const other of ["play", "", undefined, null, 5, {}]) assert.equal(ratingFor(other), null);
  });
});
