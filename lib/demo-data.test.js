"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { demoForCar } = require("./demo-data");

describe("demoForCar", () => {
  it("stamps a fresh lastUpdated on each call", async () => {
    const first = demoForCar("1", "Model 3");
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = demoForCar("1", "Model 3");
    assert.notEqual(first.lastUpdated, second.lastUpdated);
  });

  it("picks Model Y from car id 2 or performance names", () => {
    assert.match(demoForCar("2").model, /Model Y/);
    assert.match(demoForCar("1", "Model Y Performance").model, /Model Y/);
    assert.match(demoForCar("1", "Model 3").model, /Model 3/);
  });
});
