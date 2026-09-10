"use strict";

const NodeHelper = require("node_helper");
const mqtt = require("mqtt");
const {
  parseTopic,
  topicMatchesPrefix,
  makeServerKey,
  brokerUrl,
  normalizeMqttServer,
  makeTopicPrefix,
  subscribeTopic
} = require("./lib/mqtt-topics");
const { emptyVehicle, applyField, presentVehicle } = require("./lib/vehicle");
const { demoForCar } = require("./lib/demo-data");
const { instanceKey } = require("./lib/instance-payload");
const { createCoalescer } = require("./lib/coalesce");

module.exports = NodeHelper.create({
  requiresVersion: "2.1.0",

  start() {
    this.instances = new Map();
    this.brokers = new Map();
    this.logInfo(`${this.name}: node helper started`);
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "TML_CONFIG") {
      this.setupInstance(payload);
    }
  },

  label(instance) {
    const config = instance?.config || {};
    const id = instance?.identifier || config.identifier || "?";
    const name = config.displayName || `car ${config.carID || "?"}`;
    return `${this.name} [${id}] ${name}`;
  },

  logInfo(message) {
    console.log(message);
  },

  logError(message) {
    console.error(message);
  },

  setupInstance(rawConfig) {
    if (!rawConfig || !rawConfig.identifier) {
      this.logError(`${this.name}: missing identifier in config`);
      return;
    }

    const mqttServer = normalizeMqttServer(rawConfig);
    const carID = String(rawConfig.carID || this.carIdFromTopic(rawConfig.mqttTopic) || "1");
    const config = { ...rawConfig, carID, mqttServer };
    const key = instanceKey(config);
    const topics = [subscribeTopic(config)];
    const prefix = makeTopicPrefix(config);
    const existing = this.instances.get(key);

    if (existing && this.sameConnection(existing, config, topics)) {
      this.logInfo(`${this.label(existing)} already subscribed carID=${carID} prefix=${prefix}`);
      if (config.demo) {
        this.sendVehicle(existing, demoForCar(carID, config.displayName), { demo: true });
      } else if (!existing.coalesce?.flush() && this.vehicleHasData(existing.vehicle)) {
        this.sendVehicle(existing, existing.vehicle, { cached: true });
      }
      return;
    }

    if (existing) {
      this.detachInstance(existing);
    }

    const instance = {
      identifier: config.identifier,
      key,
      config,
      topics,
      prefix,
      serverKey: config.demo ? null : makeServerKey(mqttServer),
      vehicle: existing?.vehicle || emptyVehicle(),
      lastSentAt: 0
    };
    instance.vehicle.carID = carID;
    if (config.displayName) {
      instance.vehicle.displayName = config.displayName;
    }
    instance.coalesce = createCoalescer({
      idleMs: 80,
      maxMs: 250,
      onFlush: (meta) => this.sendVehicle(instance, instance.vehicle, meta)
    });
    this.instances.set(key, instance);

    if (config.demo) {
      this.logInfo(`${this.label(instance)} demo mode carID=${carID} (no MQTT)`);
      this.sendVehicle(instance, demoForCar(carID, config.displayName), { demo: true });
      return;
    }

    if (!mqttServer.address) {
      const message = "mqttServer.address (or mqttServerAddress) is required, or set demo: true";
      this.logError(`${this.label(instance)} ${message}`);
      this.sendSocketNotification("TML_ERROR", {
        identifier: instance.identifier,
        carID,
        message
      });
      return;
    }

    this.attachBroker(instance);
    this.logInfo(
      `${this.label(instance)} MQTT ${mqttServer.address}:${mqttServer.port || 1883} ` +
        `carID=${carID} prefix=${prefix} subscribe=${topics[0]}`
    );
  },

  vehicleHasData(vehicle) {
    if (!vehicle) {
      return false;
    }
    return [
      vehicle.batteryLevel,
      vehicle.batteryUsable,
      vehicle.latitude,
      vehicle.odometerKm,
      vehicle.state,
      vehicle.locked,
      vehicle.pluggedIn
    ].some((value) => value !== null && value !== undefined && value !== "");
  },

  carIdFromTopic(topic) {
    const parsed = parseTopic(`${String(topic || "").replace(/\/+$/, "")}/display_name`);
    return parsed?.carID || null;
  },

  sameConnection(instance, config, topics) {
    const prev = instance.config || {};
    return (
      Boolean(prev.demo) === Boolean(config.demo) &&
      String(prev.carID) === String(config.carID) &&
      makeTopicPrefix(prev) === makeTopicPrefix(config) &&
      makeServerKey(prev.mqttServer || {}) === makeServerKey(config.mqttServer || {}) &&
      instance.topics.join("\n") === topics.join("\n")
    );
  },

  attachBroker(instance) {
    const server = instance.config.mqttServer;
    const serverKey = makeServerKey(server);
    let broker = this.brokers.get(serverKey);
    if (!broker) {
      broker = this.connectBroker(server, serverKey);
      this.brokers.set(serverKey, broker);
    }
    broker.instances.add(instance.key);
    this.subscribeTopics(broker, instance.topics);
    instance.serverKey = serverKey;
  },

  connectBroker(server, serverKey) {
    const url = brokerUrl(server);
    const options = {
      clientId: `${this.name}-${process.pid}-${serverKey}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80),
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 15000,
      keepalive: 30,
      protocolVersion: 4,
      resubscribe: true
    };
    if (server.user) {
      options.username = server.user;
    }
    if (server.password) {
      options.password = server.password;
    }

    this.logInfo(`${this.name}: connecting ${url} as ${options.clientId}`);
    const client = mqtt.connect(url, options);
    const broker = {
      serverKey,
      url,
      client,
      instances: new Set(),
      topicRefCount: new Map(),
      connected: false
    };

    client.on("connect", () => {
      broker.connected = true;
      const topics = [...broker.topicRefCount.keys()];
      this.logInfo(`${this.name} [${serverKey}] connected, subscribing ${topics.length} topics`);
      if (topics.length) {
        client.subscribe(topics, { qos: 1 }, (err) => {
          if (err) {
            this.logError(`${this.name} [${serverKey}] subscribe failed: ${err.message}`);
          }
        });
      }
    });

    client.on("reconnect", () => {
      this.logInfo(`${this.name} [${serverKey}] reconnecting`);
    });

    client.on("error", (err) => {
      this.logError(`${this.name} [${serverKey}] MQTT error: ${err.message || err}`);
      this.broadcastBrokerError(serverKey, err.message || String(err));
    });

    client.on("close", () => {
      broker.connected = false;
    });

    client.on("message", (topic, payload) => {
      this.onMqttMessage(broker, topic, payload);
    });

    return broker;
  },

  subscribeTopics(broker, topics) {
    const fresh = [];
    for (const topic of topics) {
      const count = broker.topicRefCount.get(topic) || 0;
      broker.topicRefCount.set(topic, count + 1);
      if (count === 0) {
        fresh.push(topic);
      }
    }
    if (fresh.length && broker.connected) {
      broker.client.subscribe(fresh, { qos: 1 }, (err) => {
        if (err) {
          this.logError(`${this.name} [${broker.serverKey}] subscribe failed: ${err.message}`);
        } else {
          this.logInfo(`${this.name} [${broker.serverKey}] subscribed +${fresh.length}`);
        }
      });
    }
  },

  unsubscribeTopics(broker, topics) {
    const drop = [];
    for (const topic of topics) {
      const count = broker.topicRefCount.get(topic) || 0;
      if (count <= 1) {
        broker.topicRefCount.delete(topic);
        drop.push(topic);
      } else {
        broker.topicRefCount.set(topic, count - 1);
      }
    }
    if (drop.length && broker.client) {
      broker.client.unsubscribe(drop);
      this.logInfo(`${this.name} [${broker.serverKey}] unsubscribed ${drop.length} topics`);
    }
  },

  detachInstance(instance) {
    instance?.coalesce?.cancel();
    if (!instance?.serverKey) {
      return;
    }
    const broker = this.brokers.get(instance.serverKey);
    if (!broker) {
      return;
    }
    broker.instances.delete(instance.key);
    this.unsubscribeTopics(broker, instance.topics || []);
    if (broker.instances.size === 0) {
      this.logInfo(`${this.name} [${broker.serverKey}] closing unused MQTT client`);
      try {
        broker.client.end(true);
      } catch (err) {
        // ignore
      }
      this.brokers.delete(instance.serverKey);
    }
  },

  onMqttMessage(broker, topic, payload) {
    const value = payload == null ? "" : payload.toString();
    const parsed = parseTopic(topic);
    for (const key of broker.instances) {
      const instance = this.instances.get(key);
      if (!instance || !topicMatchesPrefix(topic, instance.prefix)) {
        continue;
      }
      applyField(instance.vehicle, parsed?.key, value);
      instance.vehicle.carID = instance.config.carID;
      instance.vehicle.lastUpdated = new Date().toISOString();
      if (instance.config.displayName && !instance.vehicle.displayName) {
        instance.vehicle.displayName = instance.config.displayName;
      }
      if (!instance.loggedFirst) {
        instance.loggedFirst = true;
        this.logInfo(
          `${this.label(instance)} first MQTT ${topic}=${value} carID=${instance.config.carID}`
        );
      }
      instance.coalesce?.push({ mqtt: true, topic, value });
    }
  },

  sendVehicle(instance, vehicle, meta) {
    const presented = presentVehicle(vehicle, {
      carID: instance.config.carID,
      displayName: vehicle?.displayName || instance.config.displayName
    });
    instance.vehicle = { ...instance.vehicle, ...vehicle };
    this.sendSocketNotification("TML_VEHICLE", {
      identifier: instance.identifier,
      carID: instance.config.carID,
      vehicle: presented,
      meta: meta || {}
    });
  },

  broadcastBrokerError(serverKey, message) {
    for (const instance of this.instances.values()) {
      if (instance.serverKey !== serverKey) {
        continue;
      }
      this.sendSocketNotification("TML_ERROR", {
        identifier: instance.identifier,
        carID: instance.config.carID,
        message
      });
    }
  },

  stop() {
    for (const instance of this.instances.values()) {
      this.detachInstance(instance);
    }
    this.instances.clear();
    for (const broker of this.brokers.values()) {
      try {
        broker.client.end(true);
      } catch (err) {
        // ignore
      }
    }
    this.brokers.clear();
  }
});
