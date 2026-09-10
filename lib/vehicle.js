"use strict";

function asBool(value) {
  if (value === true || value === false) {
    return value;
  }
  const s = String(value ?? "").trim().toLowerCase();
  if (!s || s === "null" || s === "nil" || s === "none" || s === "undefined") {
    return null;
  }
  if (s === "true" || s === "1" || s === "yes" || s === "on") {
    return true;
  }
  if (s === "false" || s === "0" || s === "no" || s === "off") {
    return false;
  }
  return null;
}

function asNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asText(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const s = String(value).trim();
  if (!s || s === "null" || s === "nil" || s === "none" || s === "undefined") {
    return null;
  }
  return s;
}

function emptyVehicle() {
  return {
    displayName: null,
    state: null,
    since: null,
    healthy: null,
    version: null,
    updateAvailable: null,
    updateVersion: null,
    model: null,
    trimBadging: null,
    exteriorColor: null,
    geofence: null,
    latitude: null,
    longitude: null,
    heading: null,
    shiftState: null,
    power: null,
    speed: null,
    locked: null,
    sentry: null,
    windowsOpen: null,
    doorsOpen: null,
    trunkOpen: null,
    frunkOpen: null,
    userPresent: null,
    climateOn: null,
    insideTempC: null,
    outsideTempC: null,
    preconditioning: null,
    odometerKm: null,
    estRangeKm: null,
    ratedRangeKm: null,
    idealRangeKm: null,
    batteryLevel: null,
    batteryUsable: null,
    pluggedIn: null,
    chargingState: null,
    chargeEnergyAdded: null,
    chargeLimitSoc: null,
    chargePortOpen: null,
    chargerCurrent: null,
    chargerPhases: null,
    chargerPower: null,
    chargerVoltage: null,
    scheduledChargeStart: null,
    timeToFullCharge: null,
    tpmsFl: null,
    tpmsFr: null,
    tpmsRl: null,
    tpmsRr: null,
    tpmsSoftFl: null,
    tpmsSoftFr: null,
    tpmsSoftRl: null,
    tpmsSoftRr: null,
    serviceMode: null,
    lastUpdated: null
  };
}

function applyLocationJson(vehicle, raw) {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const lat = asNumber(parsed?.latitude);
    const lng = asNumber(parsed?.longitude);
    if (lat !== null) {
      vehicle.latitude = lat;
    }
    if (lng !== null) {
      vehicle.longitude = lng;
    }
  } catch (err) {
    // keep previous coordinates
  }
}

function applyField(vehicle, key, raw) {
  if (!key) {
    return vehicle;
  }
  switch (key) {
    case "location":
      applyLocationJson(vehicle, raw);
      break;
    case "healthy":
    case "updateAvailable":
    case "locked":
    case "sentry":
    case "windowsOpen":
    case "doorsOpen":
    case "trunkOpen":
    case "frunkOpen":
    case "userPresent":
    case "climateOn":
    case "preconditioning":
    case "pluggedIn":
    case "chargePortOpen":
    case "tpmsSoftFl":
    case "tpmsSoftFr":
    case "tpmsSoftRl":
    case "tpmsSoftRr":
    case "serviceMode":
      vehicle[key] = asBool(raw);
      break;
    case "latitude":
    case "longitude":
    case "heading":
    case "power":
    case "speed":
    case "insideTempC":
    case "outsideTempC":
    case "odometerKm":
    case "estRangeKm":
    case "ratedRangeKm":
    case "idealRangeKm":
    case "batteryLevel":
    case "batteryUsable":
    case "chargeEnergyAdded":
    case "chargeLimitSoc":
    case "chargerCurrent":
    case "chargerPhases":
    case "chargerPower":
    case "chargerVoltage":
    case "timeToFullCharge":
    case "tpmsFl":
    case "tpmsFr":
    case "tpmsRl":
    case "tpmsRr":
      vehicle[key] = asNumber(raw);
      break;
    default:
      vehicle[key] = asText(raw);
  }
  return vehicle;
}

function isCharging(vehicle) {
  const state = String(vehicle?.chargingState || "").toLowerCase();
  if (state === "charging") {
    return true;
  }
  if (state && state !== "null") {
    return false;
  }
  return Boolean(vehicle?.pluggedIn) && Number(vehicle?.timeToFullCharge) > 0;
}

const MIN_SESSION_VOLTS = 80;

function liveChargerVoltage(vehicle) {
  const n = Number(vehicle?.chargerVoltage);
  if (!Number.isFinite(n) || n < MIN_SESSION_VOLTS) {
    return null;
  }
  if (!isCharging(vehicle)) {
    return null;
  }
  return n;
}

function tireSet(vehicle) {
  const fl = vehicle?.tpmsFl;
  const fr = vehicle?.tpmsFr;
  const rl = vehicle?.tpmsRl;
  const rr = vehicle?.tpmsRr;
  const values = [fl, fr, rl, rr].filter((n) => n !== null && n !== undefined && Number.isFinite(Number(n)));
  return {
    fl,
    fr,
    rl,
    rr,
    unit: "bar",
    count: values.length
  };
}

const TPMS_SOFT_LABELS = [
  ["tpmsSoftFl", "Front left"],
  ["tpmsSoftFr", "Front right"],
  ["tpmsSoftRl", "Rear left"],
  ["tpmsSoftRr", "Rear right"]
];

function tpmsSoftWarningText(vehicle) {
  const parts = TPMS_SOFT_LABELS.filter(([key]) => vehicle?.[key] === true).map(([, label]) => label);
  return parts.length ? parts.join(", ") : null;
}

function presentVehicle(raw, extras) {
  const v = { ...(raw || emptyVehicle()), ...(extras || {}) };
  v.charging = isCharging(v);
  v.chargeTarget = v.chargeLimitSoc;
  v.rangeKm = v.idealRangeKm ?? v.ratedRangeKm ?? v.estRangeKm;
  v.tires = tireSet(v);
  v.plugVoltage = liveChargerVoltage(v);
  v.plugVoltageUnit = "V";
  v.tpmsSoftWarningText = tpmsSoftWarningText(v);
  v.serviceMode = v.serviceMode === true;
  return v;
}

module.exports = {
  asBool,
  asNumber,
  asText,
  emptyVehicle,
  applyField,
  isCharging,
  liveChargerVoltage,
  tireSet,
  tpmsSoftWarningText,
  presentVehicle
};
