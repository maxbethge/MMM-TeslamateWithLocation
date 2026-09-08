"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { applyField, emptyVehicle, isCharging, presentVehicle } = require("./vehicle");

describe("applyField", () => {
  it("parses booleans from Teslamate strings", () => {
    const v = emptyVehicle();
    applyField(v, "pluggedIn", "true");
    applyField(v, "locked", "false");
    assert.equal(v.pluggedIn, true);
    assert.equal(v.locked, false);
  });

  it("reads location JSON as well as lat/lon topics", () => {
    const v = emptyVehicle();
    applyField(v, "location", '{"latitude": 37.5, "longitude": -122.1}');
    assert.equal(v.latitude, 37.5);
    assert.equal(v.longitude, -122.1);
  });
});

describe("isCharging", () => {
  it("uses charging_state when present", () => {
    assert.equal(isCharging({ chargingState: "Charging", pluggedIn: true }), true);
    assert.equal(isCharging({ chargingState: "Complete", pluggedIn: true, timeToFullCharge: 0 }), false);
  });

  it("falls back to plugged in plus time remaining", () => {
    assert.equal(isCharging({ pluggedIn: true, timeToFullCharge: 1.2 }), true);
    assert.equal(isCharging({ pluggedIn: true, timeToFullCharge: 0 }), false);
  });
});

describe("presentVehicle", () => {
  it("exposes Teslamate table metrics plus charge target", () => {
    const v = presentVehicle({
      chargeLimitSoc: 80,
      idealRangeKm: 300,
      tpmsFl: 2.9,
      tpmsFr: 2.9,
      tpmsRl: 2.8,
      tpmsRr: 2.8,
      chargerVoltage: 240
    });
    assert.equal(v.chargeTarget, 80);
    assert.equal(v.rangeKm, 300);
    assert.equal(v.tires.count, 4);
    assert.equal(v.plugVoltage, 240);
  });
});
