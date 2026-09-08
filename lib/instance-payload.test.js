"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { payloadIsForInstance, wantsRangeDisplay, instanceKey } = require("./instance-payload");

describe("payloadIsForInstance", () => {
  it("accepts a matching identifier", () => {
    assert.equal(
      payloadIsForInstance({ identifier: "mod_1" }, { identifier: "mod_1", carID: "1" }),
      true
    );
  });

  it("rejects a different identifier even if carID matches", () => {
    assert.equal(
      payloadIsForInstance(
        { identifier: "mod_2", carID: "1" },
        { identifier: "mod_1", carID: "1" }
      ),
      false
    );
  });

  it("rejects a different carID even if identifier matches", () => {
    assert.equal(
      payloadIsForInstance(
        { identifier: "mod_1", carID: "2", vehicle: { carID: "2" } },
        { identifier: "mod_1", carID: "1" }
      ),
      false
    );
  });

  it("accepts carID match when identifiers are missing", () => {
    assert.equal(payloadIsForInstance({ carID: "1" }, { carID: "1" }), true);
  });
});

describe("wantsRangeDisplay", () => {
  it("treats range as range mode", () => {
    assert.equal(wantsRangeDisplay("range"), true);
  });

  it("treats percent as SOC mode", () => {
    assert.equal(wantsRangeDisplay("%"), false);
    assert.equal(wantsRangeDisplay("soc"), false);
  });
});

describe("instanceKey", () => {
  it("keeps two modules with the same carID distinct", () => {
    assert.notEqual(
      instanceKey({ identifier: "a", carID: "1" }),
      instanceKey({ identifier: "b", carID: "1" })
    );
  });
});
