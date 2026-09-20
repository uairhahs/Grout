import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readPage } from "../src/page/reader.ts";
import { hasRating, isSupported } from "../src/page/sites.ts";

/** A page: its Media Session, the media elements on it, and (for YouTube Music) the like buttons. */
function env({ metadata, playbackState = "none", elements = [], likePressed } = {}) {
  const media = elements.map((paused) => ({ paused, ended: false }));
  const buttons =
    likePressed === undefined
      ? null
      : {
          getAttribute: () => null,
          querySelector: (selector) => ({ getAttribute: (a) => (a === "aria-pressed" ? (selector.includes("like") && !selector.includes("dislike") ? String(likePressed) : "false") : null) }),
        };
  return {
    navigator: { mediaSession: { metadata, playbackState } },
    document: { querySelectorAll: () => media, querySelector: (selector) => (selector.includes("like-button-renderer") ? buttons : null) },
  };
}

const track = { title: "Humid", artist: "Moody Good", album: "Album", artwork: [{ src: "https://i.ytimg.com/a.jpg", sizes: "320x180" }] };

describe("what a page is playing", () => {
  it("is nothing when the page publishes no media", () => {
    assert.equal(readPage(env({ metadata: null }), false), null);
    assert.equal(readPage({ navigator: {}, document: { querySelectorAll: () => [], querySelector: () => null } }, false), null);
  });

  it("carries title, artist, album and every image the page offers", () => {
    const reading = readPage(env({ metadata: track }), false);

    assert.equal(reading.title, "Humid");
    assert.equal(reading.artist, "Moody Good");
    assert.equal(reading.album, "Album");
    assert.deepEqual(reading.artwork, [{ src: "https://i.ytimg.com/a.jpg", sizes: "320x180" }]);
  });

  it("copes with a page that leaves fields out", () => {
    const reading = readPage(env({ metadata: { title: "Only a title" } }), false);

    assert.equal(reading.artist, "");
    assert.deepEqual(reading.artwork, []);
  });

  it("says playing while a media element plays, even if the Media Session has not caught up", () => {
    assert.equal(readPage(env({ metadata: track, playbackState: "none", elements: [false] }), false).playbackState, "playing");
    assert.equal(readPage(env({ metadata: track, playbackState: "paused", elements: [true, false] }), false).playbackState, "playing");
  });

  it("says playing on the Media Session's word when the page has no media element to look at", () => {
    assert.equal(readPage(env({ metadata: track, playbackState: "playing" }), false).playbackState, "playing");
  });

  it("says paused when the page has media but nothing is playing", () => {
    assert.equal(readPage(env({ metadata: track, playbackState: "paused", elements: [true] }), false).playbackState, "paused");
    assert.equal(readPage(env({ metadata: track, playbackState: "none" }), false).playbackState, "paused");
  });
});

describe("the rating", () => {
  it("is read only where the caller says the buttons have been measured", () => {
    assert.equal(readPage(env({ metadata: track, likePressed: true }), true).rating, "liked");
    assert.equal(readPage(env({ metadata: track, likePressed: false }), true).rating, "none");
    assert.equal(readPage(env({ metadata: track, likePressed: true }), false).rating, undefined);
  });

  it("is left out when the page has no buttons, rather than guessed", () => {
    assert.equal(readPage(env({ metadata: track }), true).rating, undefined);
  });
});

describe("which pages are read", () => {
  it("reads the four supported sites", () => {
    for (const hostname of ["music.youtube.com", "www.youtube.com", "open.spotify.com", "soundcloud.com"]) {
      assert.equal(isSupported({ hostname, pathname: "/" }), true, hostname);
    }
  });

  it("reads nothing else: look-alikes, other subdomains and embedded players", () => {
    for (const [hostname, pathname] of [["example.com", "/"], ["m.youtube.com", "/"], ["youtube.com.evil.example", "/"], ["notsoundcloud.com", "/"], ["accounts.spotify.com", "/"], ["www.youtube.com", "/embed/abc"]]) {
      assert.equal(isSupported({ hostname, pathname }), false, hostname + pathname);
    }
  });

  it("offers a rating only on YouTube Music", () => {
    assert.equal(hasRating({ hostname: "music.youtube.com" }), true);
    for (const hostname of ["www.youtube.com", "open.spotify.com", "soundcloud.com", "example.com"]) assert.equal(hasRating({ hostname }), false, hostname);
  });
});
