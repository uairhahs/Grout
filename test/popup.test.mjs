import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeStatus } from "../src/popup/view.ts";

const session = (over = {}) => ({ tabId: 7, origin: "https://music.youtube.com", title: "Humid", artist: "Moody Good", playbackState: "playing", ...over });
const status = (state, over = {}) => ({ state, extensionId: "aaffcapodpfecchmelidkkhgiaamijpe", sessions: [], ...over });

describe("what the popup says about the link to MosaicShell", () => {
  it("is good news when connected, and says what Grout reads when this tab plays nothing", () => {
    const view = describeStatus(status("connected"), 7);

    assert.equal(view.tone, "good");
    assert.equal(view.heading, "Connected to MosaicShell");
    assert.match(view.body, /YouTube Music, YouTube, Spotify and SoundCloud/);
    assert.equal(view.track, undefined);
  });

  it("shows what this tab is reporting, and not what another tab is", () => {
    const sessions = [session({ tabId: 7 }), session({ tabId: 9, title: "Another song", artist: "Someone else" })];

    const view = describeStatus(status("connected", { sessions }), 7);

    assert.deepEqual(view.track, { title: "Humid", artist: "Moody Good", playing: true });
    assert.match(view.body, /Reporting this tab/);
  });

  it("says whether the track is playing or paused", () => {
    const paused = describeStatus(status("connected", { sessions: [session({ playbackState: "paused" })] }), 7);

    assert.equal(paused.track.playing, false);
  });

  it("is a neutral wait, not an error, while MosaicShell is not running", () => {
    const view = describeStatus(status("waiting"), 7);

    assert.equal(view.tone, "wait");
    assert.equal(view.heading, "Waiting for MosaicShell");
    assert.match(view.body, /Start MosaicShell/);
  });

  it("asks for attention, and says what to do, when MosaicShell has not set Grout up", () => {
    const view = describeStatus(status("unavailable"), 7);

    assert.equal(view.tone, "attention");
    assert.equal(view.heading, "MosaicShell has not set Grout up");
    assert.match(view.body, /Start MosaicShell once/);
  });

  it("asks for attention when MosaicShell does not trust this copy, and shows the ID it would have to allow", () => {
    const view = describeStatus(status("refused"), 7);

    assert.equal(view.tone, "attention");
    assert.equal(view.heading, "MosaicShell does not trust this copy of Grout");
    assert.match(view.body, /release page|update MosaicShell/);
    assert.equal(view.extensionId, "aaffcapodpfecchmelidkkhgiaamijpe");
  });

  it("does not show a track while nothing is connected to show it to", () => {
    for (const state of ["starting", "waiting", "unavailable", "refused"]) {
      assert.equal(describeStatus(status(state, { sessions: [session()] }), 7).track, undefined, state);
    }
  });
});

describe("a status that is missing or wrong", () => {
  it("reads as starting, since a worker that has just woken has said nothing yet", () => {
    for (const bad of [undefined, null, "text", 5, {}, { state: "exploding" }, { state: 7 }]) {
      const view = describeStatus(bad, 7);

      assert.equal(view.tone, "wait", JSON.stringify(bad));
      assert.equal(view.heading, "Starting", JSON.stringify(bad));
    }
  });

  it("copes with sessions that are not a list, and ignores an extension id that is not text", () => {
    const view = describeStatus({ state: "connected", sessions: "nope", extensionId: 12 }, 7);

    assert.equal(view.heading, "Connected to MosaicShell");
    assert.equal(view.track, undefined);
    assert.equal(view.extensionId, undefined);
  });

  it("copes with a tab that is not known", () => {
    const view = describeStatus(status("connected", { sessions: [session()] }), undefined);

    assert.equal(view.track, undefined);
  });
});

describe("the words", () => {
  it("are plain text: a title is passed on exactly as the page gave it, for the page to show as text and never as markup", () => {
    const view = describeStatus(status("connected", { sessions: [session({ title: "<b>Humid</b> & co" })] }), 7);

    assert.equal(view.track.title, "<b>Humid</b> & co");
  });
});
