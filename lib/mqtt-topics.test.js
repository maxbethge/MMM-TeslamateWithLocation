"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  makeTopicPrefix,
  topicList,
  parseTopic,
  topicMatchesPrefix,
  makeServerKey,
  normalizeMqttServer
} = require("./mqtt-topics");

describe("makeTopicPrefix", () => {
  it("uses mqttTopic when provided", () => {
    assert.equal(makeTopicPrefix({ mqttTopic: "teslamate/cars/2/" }), "teslamate/cars/2");
  });

  it("builds teslamate/cars/{carID}", () => {
    assert.equal(makeTopicPrefix({ carID: "3" }), "teslamate/cars/3");
  });

  it("prefixes a Teslamate MQTT namespace", () => {
    assert.equal(makeTopicPrefix({ carID: "1", mqttNamespace: "home" }), "home/teslamate/cars/1");
  });
});

describe("topicList", () => {
  it("includes Teslamate stats and location topics", () => {
    const topics = topicList({ carID: "1" });
    assert.ok(topics.includes("teslamate/cars/1/battery_level"));
    assert.ok(topics.includes("teslamate/cars/1/latitude"));
    assert.ok(topics.includes("teslamate/cars/1/longitude"));
    assert.ok(topics.includes("teslamate/cars/1/location"));
    assert.ok(topics.includes("teslamate/cars/1/tpms_pressure_fl"));
    assert.ok(topics.includes("teslamate/cars/1/geofence"));
  });
});

describe("parseTopic", () => {
  it("extracts car id and metric", () => {
    assert.deepEqual(parseTopic("teslamate/cars/2/battery_level"), {
      namespace: "",
      carID: "2",
      metric: "battery_level",
      key: "batteryLevel"
    });
  });

  it("keeps a namespace prefix", () => {
    assert.equal(parseTopic("prod/teslamate/cars/1/latitude").namespace, "prod");
    assert.equal(parseTopic("prod/teslamate/cars/1/latitude").carID, "1");
  });
});

describe("topicMatchesPrefix", () => {
  it("matches only the configured car", () => {
    assert.equal(topicMatchesPrefix("teslamate/cars/1/speed", "teslamate/cars/1"), true);
    assert.equal(topicMatchesPrefix("teslamate/cars/2/speed", "teslamate/cars/1"), false);
  });
});

describe("makeServerKey", () => {
  it("includes user so two accounts on one host stay apart", () => {
    assert.notEqual(
      makeServerKey({ address: "mqtt.local", port: 1883, user: "a" }),
      makeServerKey({ address: "mqtt.local", port: 1883, user: "b" })
    );
  });
});

describe("normalizeMqttServer", () => {
  it("accepts Teslamate nested mqttServer", () => {
    const s = normalizeMqttServer({ mqttServer: { address: "10.0.0.2", port: 1884, user: "u" } });
    assert.equal(s.address, "10.0.0.2");
    assert.equal(s.port, 1884);
  });

  it("accepts TeslamateLocation flat keys", () => {
    const s = normalizeMqttServer({
      mqttServerAddress: "10.0.0.9",
      mqttServerPort: "1883",
      mqttServerUser: "pi"
    });
    assert.equal(s.address, "10.0.0.9");
    assert.equal(s.user, "pi");
  });
});
