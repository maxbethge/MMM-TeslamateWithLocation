"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createCoalescer } = require("./coalesce");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("createCoalescer", () => {
  it("flushes the latest item after idle silence", async () => {
    const flushed = [];
    const c = createCoalescer({
      idleMs: 30,
      maxMs: 200,
      onFlush: (item) => flushed.push(item)
    });
    c.push("a");
    c.push("b");
    c.push("c");
    await delay(80);
    assert.deepEqual(flushed, ["c"]);
    c.cancel();
  });

  it("flushes on max wait even if items keep arriving", async () => {
    const flushed = [];
    const c = createCoalescer({
      idleMs: 40,
      maxMs: 70,
      onFlush: (item) => flushed.push(item)
    });
    c.push(1);
    await delay(25);
    c.push(2);
    await delay(25);
    c.push(3);
    await delay(40);
    assert.equal(flushed.length, 1);
    assert.equal(flushed[0], 3);
    c.cancel();
  });

  it("cancel drops a pending flush", async () => {
    const flushed = [];
    const c = createCoalescer({
      idleMs: 30,
      maxMs: 200,
      onFlush: (item) => flushed.push(item)
    });
    c.push("x");
    c.cancel();
    await delay(60);
    assert.deepEqual(flushed, []);
  });
});
