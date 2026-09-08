"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { barToPsi, formatTire, formatSpeed, tireUnitLabel } = require("./units");

describe("units", () => {
  it("converts Teslamate bar TPMS to psi", () => {
    assert.equal(Math.round(barToPsi(2.9)), 42);
    assert.equal(formatTire(2.9, true, 0), "42");
    assert.equal(formatTire(2.9, false, 1), "2.9");
    assert.equal(tireUnitLabel(true), "psi");
    assert.equal(tireUnitLabel(false), "bar");
  });

  it("converts speed to mph when imperial", () => {
    assert.equal(formatSpeed(100, false), "100 km/h");
    assert.equal(formatSpeed(100, true), "62 mph");
  });
});
