"use strict";

function carKey(value) {
  return String(value || "").trim();
}

function payloadIsForInstance(payload, instance) {
  if (!payload) {
    return false;
  }
  const myId = String(instance?.identifier || "");
  const theirId = String(payload.identifier || "");
  if (myId && theirId && myId !== theirId) {
    return false;
  }
  const myCar = carKey(instance?.carID);
  const theirCar = carKey(payload.carID || payload.vehicle?.carID);
  if (myCar && theirCar && myCar !== theirCar) {
    return false;
  }
  return Boolean((myId && theirId && myId === theirId) || (myCar && theirCar && myCar === theirCar));
}

function wantsRangeDisplay(rangeDisplay) {
  const s = String(rangeDisplay ?? "").trim().toLowerCase();
  if (!s || s === "%" || s === "soc" || s === "percent" || s === "percentage" || s === "battery") {
    return false;
  }
  return s === "range" || s === "mi" || s === "km" || s === "miles" || s === "distance" || s.includes("range");
}

function instanceKey(config) {
  const id = String(config?.identifier || "");
  const carID = carKey(config?.carID);
  return carID ? `${id}::${carID}` : id;
}

module.exports = { carKey, payloadIsForInstance, wantsRangeDisplay, instanceKey };
