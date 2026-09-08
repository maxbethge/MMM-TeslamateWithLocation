"use strict";

const TOPIC_KEYS = {
  display_name: "displayName",
  state: "state",
  since: "since",
  healthy: "healthy",
  version: "version",
  update_available: "updateAvailable",
  update_version: "updateVersion",
  model: "model",
  trim_badging: "trimBadging",
  exterior_color: "exteriorColor",
  geofence: "geofence",
  latitude: "latitude",
  longitude: "longitude",
  location: "location",
  shift_state: "shiftState",
  power: "power",
  speed: "speed",
  heading: "heading",
  locked: "locked",
  sentry_mode: "sentry",
  windows_open: "windowsOpen",
  doors_open: "doorsOpen",
  trunk_open: "trunkOpen",
  frunk_open: "frunkOpen",
  is_user_present: "userPresent",
  is_climate_on: "climateOn",
  inside_temp: "insideTempC",
  outside_temp: "outsideTempC",
  is_preconditioning: "preconditioning",
  odometer: "odometerKm",
  est_battery_range_km: "estRangeKm",
  rated_battery_range_km: "ratedRangeKm",
  ideal_battery_range_km: "idealRangeKm",
  battery_level: "batteryLevel",
  usable_battery_level: "batteryUsable",
  plugged_in: "pluggedIn",
  charging_state: "chargingState",
  charge_energy_added: "chargeEnergyAdded",
  charge_limit_soc: "chargeLimitSoc",
  charge_port_door_open: "chargePortOpen",
  charger_actual_current: "chargerCurrent",
  charger_phases: "chargerPhases",
  charger_power: "chargerPower",
  charger_voltage: "chargerVoltage",
  scheduled_charging_start_time: "scheduledChargeStart",
  time_to_full_charge: "timeToFullCharge",
  tpms_pressure_fl: "tpmsFl",
  tpms_pressure_fr: "tpmsFr",
  tpms_pressure_rl: "tpmsRl",
  tpms_pressure_rr: "tpmsRr"
};

function makeTopicPrefix(config) {
  const explicit = String(config?.mqttTopic || "").trim().replace(/\/+$/, "");
  if (explicit) {
    return explicit;
  }
  const namespace = String(config?.mqttNamespace || "").trim().replace(/\/+$/, "");
  const carID = String(config?.carID || "1");
  const base = `teslamate/cars/${carID}`;
  return namespace ? `${namespace}/${base}` : base;
}

function topicList(config) {
  const prefix = makeTopicPrefix(config);
  return Object.keys(TOPIC_KEYS).map((metric) => `${prefix}/${metric}`);
}

function parseTopic(topic) {
  const text = String(topic || "");
  const match = text.match(/^(?:(.+)\/)?teslamate\/cars\/([^/]+)\/([^/]+)$/) || text.match(/^(.*)\/([^/]+)$/);
  if (!match) {
    return null;
  }
  if (match.length === 4) {
    return {
      namespace: match[1] || "",
      carID: match[2],
      metric: match[3],
      key: TOPIC_KEYS[match[3]] || null
    };
  }
  return {
    namespace: "",
    carID: "",
    metric: match[2],
    key: TOPIC_KEYS[match[2]] || null
  };
}

function topicMatchesPrefix(topic, prefix) {
  const p = String(prefix || "").replace(/\/+$/, "");
  const t = String(topic || "");
  return t === p || t.startsWith(`${p}/`);
}

function makeServerKey(server) {
  const address = String(server?.address || "").trim();
  const port = server?.port == null || server.port === "" ? "1883" : String(server.port);
  const user = String(server?.user || "");
  return `${address}:${port}:${user}`;
}

function brokerUrl(server) {
  const address = String(server?.address || "").trim();
  if (!address) {
    throw new Error("mqttServer.address is required");
  }
  const withScheme = /^mqtts?:\/\//i.test(address) ? address : `mqtt://${address}`;
  if (server?.port) {
    return `${withScheme}:${server.port}`;
  }
  return withScheme;
}

function normalizeMqttServer(config) {
  const nested = config?.mqttServer || {};
  return {
    address: nested.address || config?.mqttServerAddress || null,
    port: nested.port || config?.mqttServerPort || 1883,
    user: nested.user || nested.username || config?.mqttServerUser || null,
    password: nested.password || config?.mqttServerPassword || null
  };
}

module.exports = {
  TOPIC_KEYS,
  makeTopicPrefix,
  topicList,
  parseTopic,
  topicMatchesPrefix,
  makeServerKey,
  brokerUrl,
  normalizeMqttServer
};
