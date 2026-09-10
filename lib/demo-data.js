"use strict";

const model3 = {
  carID: "1",
  displayName: "Model 3",
  year: "2018",
  make: "Tesla",
  model: "Model 3",
  state: "charging",
  healthy: true,
  geofence: "Home",
  batteryLevel: 72,
  batteryUsable: 71,
  chargeLimitSoc: 80,
  rangeKm: 354,
  idealRangeKm: 354,
  ratedRangeKm: 372,
  estRangeKm: 340,
  odometerKm: 68420,
  pluggedIn: true,
  charging: true,
  chargingState: "Charging",
  chargeEnergyAdded: 12.4,
  timeToFullCharge: 1.58,
  chargerVoltage: 240,
  chargerCurrent: 32,
  chargerPower: 7.6,
  latitude: 37.3947,
  longitude: -122.1503,
  heading: 88,
  outsideTempC: 18,
  insideTempC: 21,
  climateOn: false,
  preconditioning: false,
  locked: true,
  sentry: false,
  windowsOpen: false,
  doorsOpen: false,
  trunkOpen: false,
  frunkOpen: false,
  userPresent: false,
  updateAvailable: false,
  speed: 0,
  shiftState: "P",
  tpmsFl: 2.9,
  tpmsFr: 2.9,
  tpmsRl: 2.8,
  tpmsRr: 2.8,
  lastUpdated: new Date().toISOString()
};

const modelY = {
  carID: "2",
  displayName: "Model Y",
  year: "2023",
  make: "Tesla",
  model: "Model Y Performance",
  trimBadging: "P",
  state: "online",
  healthy: true,
  geofence: "Work",
  batteryLevel: 55,
  batteryUsable: 54,
  chargeLimitSoc: 90,
  rangeKm: 312,
  idealRangeKm: 312,
  ratedRangeKm: 328,
  estRangeKm: 298,
  odometerKm: 24110,
  pluggedIn: true,
  charging: false,
  chargingState: "Stopped",
  scheduledChargeStart: "23:00",
  latitude: 37.4419,
  longitude: -122.143,
  heading: 12,
  outsideTempC: 16,
  insideTempC: 20,
  climateOn: false,
  preconditioning: false,
  locked: true,
  sentry: true,
  windowsOpen: false,
  doorsOpen: false,
  trunkOpen: false,
  frunkOpen: false,
  userPresent: false,
  updateAvailable: true,
  serviceMode: true,
  tpmsSoftFl: true,
  speed: 0,
  shiftState: "P",
  tpmsFl: 2.8,
  tpmsFr: 2.8,
  tpmsRl: 2.9,
  tpmsRr: 2.9,
  lastUpdated: new Date().toISOString()
};

function demoForCar(carID, displayName) {
  const key = String(carID || displayName || "").toLowerCase();
  const now = new Date().toISOString();
  if (/y|2|performance/.test(key) && !/3|model 3/.test(key)) {
    return { ...modelY, carID: carID || modelY.carID, displayName: displayName || modelY.displayName, lastUpdated: now };
  }
  if (/y|performance/.test(String(displayName || "").toLowerCase())) {
    return { ...modelY, carID: carID || modelY.carID, displayName: displayName || modelY.displayName, lastUpdated: now };
  }
  return { ...model3, carID: carID || model3.carID, displayName: displayName || model3.displayName, lastUpdated: now };
}

module.exports = { model3, modelY, demoForCar };
