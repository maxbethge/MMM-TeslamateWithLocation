"use strict";

function kmToMi(km, digits) {
  const n = Number(km);
  if (!Number.isFinite(n)) {
    return null;
  }
  const mi = n / 1.609344;
  return digits == null ? mi : Number(mi.toFixed(digits));
}

function cToF(c, digits) {
  const n = Number(c);
  if (!Number.isFinite(n)) {
    return null;
  }
  const f = (n * 9) / 5 + 32;
  return digits == null ? f : Number(f.toFixed(digits));
}

function barToPsi(bar, digits) {
  const n = Number(bar);
  if (!Number.isFinite(n)) {
    return null;
  }
  const psi = n * 14.503773773;
  return digits == null ? psi : Number(psi.toFixed(digits));
}

function formatDistance(km, imperial) {
  if (km === null || km === undefined || !Number.isFinite(Number(km))) {
    return "--";
  }
  if (imperial) {
    return `${Math.round(Number(km) / 1.609344).toLocaleString()} mi`;
  }
  return `${Math.round(Number(km)).toLocaleString()} km`;
}

function formatSpeed(kmh, imperial) {
  if (kmh === null || kmh === undefined || !Number.isFinite(Number(kmh))) {
    return "--";
  }
  if (imperial) {
    return `${Math.round(Number(kmh) / 1.609344)} mph`;
  }
  return `${Math.round(Number(kmh))} km/h`;
}

function formatTemp(c, imperial) {
  if (c === null || c === undefined || !Number.isFinite(Number(c))) {
    return "--";
  }
  if (imperial) {
    return `${Math.round((Number(c) * 9) / 5 + 32)}°F`;
  }
  return `${Math.round(Number(c))}°C`;
}

function formatTire(bar, imperial, digits) {
  if (bar === null || bar === undefined || !Number.isFinite(Number(bar))) {
    return "--";
  }
  const places = digits == null ? (imperial ? 0 : 1) : digits;
  if (imperial) {
    return barToPsi(bar, places).toFixed(places);
  }
  return Number(bar).toFixed(places);
}

function tireUnitLabel(imperial) {
  return imperial ? "psi" : "bar";
}

module.exports = {
  kmToMi,
  cToF,
  barToPsi,
  formatDistance,
  formatSpeed,
  formatTemp,
  formatTire,
  tireUnitLabel
};
