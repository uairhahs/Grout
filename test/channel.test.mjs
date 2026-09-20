import assert from "node:assert/strict";
import { describe, it } from "node:test";

// The page-world script answers the content script over window messages. It must answer only its own page's content
// script, over its own channel, and only for the two things it can do, and only on a page it supports.
const listeners = [];
const posted = [];
globalThis.window = {
  addEventListener: (type, listener) => type === "message" && listeners.push(listener),
  postMessage: (data, origin) => posted.push({ data, origin }),
};
globalThis.location = { hostname: "example.com", pathname: "/", origin: "https://example.com" };
globalThis.document = { querySelector: () => null, querySelectorAll: () => [] };

await import("../src/page/main.ts");

const send = (event) => {
  posted.length = 0;
  for (const listener of listeners) listener(event);
  return [...posted];
};
const request = (extra = {}) => ({ source: globalThis.window, origin: "https://example.com", data: { grout: 1, kind: "request", id: "a1", func: "read", ...extra } });

describe("the page-world script", () => {
  it("registers once, however many times it is loaded", async () => {
    const before = listeners.length;
    await import("../src/page/main.ts?again");
    assert.equal(listeners.length, before);
  });

  it("answers its own page's request over its own channel, to its own origin", () => {
    const [reply] = send(request());

    assert.equal(reply.origin, "https://example.com");
    assert.deepEqual(reply.data, { grout: 1, kind: "response", id: "a1", value: null }, "a page that is not supported has no reading");
  });

  it("ignores a message from another window, another origin, or another channel", () => {
    assert.deepEqual(send({ ...request(), source: {} }), []);
    assert.deepEqual(send({ ...request(), origin: "https://evil.example" }), []);
    assert.deepEqual(send(request({ grout: 2 })), []);
    assert.deepEqual(send(request({ kind: "response" })), []);
    assert.deepEqual(send(request({ id: 5 })), []);
    assert.deepEqual(send({ source: globalThis.window, origin: "https://example.com", data: null }), []);
  });

  it("does nothing for a request it does not know, or a rating it does not know", () => {
    assert.equal(send(request({ func: "eval", arg: "1" }))[0].data.value, null);
    assert.equal(send(request({ func: "rate", arg: "love" }))[0].data.value, null);
    assert.equal(send(request({ func: "rate", arg: 5 }))[0].data.value, null);
  });
});
