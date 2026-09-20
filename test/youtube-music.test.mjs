import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buttonFor, rate, readRating } from "../src/page/youtube-music.ts";

const RATINGS = ["none", "liked", "disliked"];

/**
 * YouTube Music's two like buttons as a page. Pressing one toggles it and, when it turns on, switches the other one
 * off, which is what the site does. `attrs` are the aria-pressed values the buttons show.
 */
function makePage({ like = "false", dislike = "false", status = null, present = true, missing = null } = {}) {
  const attrs = { like, dislike };
  const clicks = [];
  const button = (name, other) => ({
    getAttribute: (attribute) => (attribute === "aria-pressed" ? attrs[name] ?? null : null),
    click: () => {
      clicks.push(name);
      const turningOn = attrs[name] !== "true";
      attrs[name] = turningOn ? "true" : "false";
      if (turningOn) attrs[other] = "false";
    },
  });
  const buttons = { "#button-shape-like button": button("like", "dislike"), "#button-shape-dislike button": button("dislike", "like") };
  const renderer = {
    getAttribute: (attribute) => (attribute === "like-status" ? status : null),
    querySelector: (selector) => (missing && selector.includes(missing) ? null : buttons[selector] ?? null),
  };
  const doc = { querySelector: (selector) => (present && selector.includes("like-button-renderer") ? renderer : null) };
  return { doc, clicks, attrs };
}

const pageAt = (rating) => makePage({ like: String(rating === "liked"), dislike: String(rating === "disliked") });

describe("reading the rating", () => {
  it("reads liked, disliked and none from the pressed state of the buttons", () => {
    for (const rating of RATINGS) assert.equal(readRating(pageAt(rating).doc), rating);
  });

  it("falls back to the renderer's like-status when the buttons do not say", () => {
    for (const [status, expected] of [["LIKE", "liked"], ["DISLIKE", "disliked"], ["INDIFFERENT", "none"]]) {
      assert.equal(readRating(makePage({ like: null, dislike: null, status }).doc), expected, status);
    }
  });

  it("is null, never a guess, when nothing says or the buttons are not there", () => {
    assert.equal(readRating(makePage({ like: null, dislike: null }).doc), null);
    assert.equal(readRating(makePage({ like: null, dislike: null, status: "SOMETHING_NEW" }).doc), null);
    assert.equal(readRating(makePage({ present: false }).doc), null);
    assert.equal(readRating(makePage({ missing: "dislike" }).doc), null);
  });
});

describe("which button gets from one rating to another", () => {
  for (const current of RATINGS) {
    for (const wanted of RATINGS) {
      it(`from ${current} to ${wanted}`, () => {
        const page = pageAt(current);

        const result = rate(page.doc, wanted);

        assert.equal(readRating(page.doc), wanted, "the buttons end in the wanted state");
        assert.ok(page.clicks.length <= 1, `at most one click, got ${page.clicks.join(", ")}`);
        assert.equal(result, current === wanted ? "already" : "pressed");
        assert.equal(buttonFor(current, wanted), page.clicks[0] ?? null, "the pure rule names the button that was pressed");
      });
    }
  }

  it("presses nothing to clear a track that has no rating", () => {
    assert.equal(buttonFor("none", "none"), null);
  });
});

describe("a state the page does not show", () => {
  it("is never pressed from, whatever was asked, because a button that is already on would turn off", () => {
    for (const wanted of RATINGS) {
      const page = makePage({ like: null, dislike: null });

      assert.equal(rate(page.doc, wanted), "unknown");
      assert.deepEqual(page.clicks, []);
    }
  });

  it("is also what a page without the buttons is", () => {
    const page = makePage({ present: false });

    assert.equal(rate(page.doc, "liked"), "unknown");
    assert.deepEqual(page.clicks, []);
  });
});
