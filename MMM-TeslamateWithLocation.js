Module.register("MMM-TeslamateWithLocation", {
  requiresVersion: "2.1.0",
  defaults: {
    mqttServer: {},
    mqttServerAddress: null,
    mqttServerPort: 1883,
    mqttServerUser: null,
    mqttServerPassword: null,
    mqttTopic: null,
    mqttNamespace: null,
    carID: "1",
    displayName: null,
    demo: false,
    rangeDisplay: "%",
    imperial: false,
    hybridView: true,
    showMap: true,
    mapHeight: "220px",
    mapWidth: "100%",
    height: null,
    width: null,
    zoomLevel: 16,
    tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    tileAttribution: "&copy; OpenStreetMap contributors",
    tileSubdomains: "abc",
    tileLabelUrl: null,
    mapStyle: "dark",
    mapTileFilter: "invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9) saturate(0.35)",
    carImage: null,
    carImageOptions: {
      model: "m3",
      view: "STUD_3QTR",
      options: "PPSW,W38B",
      opacity: 0.9,
      imageOpacity: null,
      scale: 1,
      verticalOffset: 0
    },
    sizeOptions: {
      width: 450,
      height: 175,
      batWidth: 250,
      batWitdh: null,
      batHeight: 45,
      topOffset: 0,
      fontSize: null,
      lineHeight: null
    },
    displayOptions: {
      odometer: { visible: true },
      chargeTarget: { visible: true },
      chargeAdded: { visible: true },
      batteryBar: { visible: true, topMargin: 0 },
      temperatureIcons: { topMargin: 0 },
      temperatures: { visible: true },
      tpms: { visible: true },
      speed: { visible: true },
      geofence: { visible: true }
    },
    showTemps: "hvac_on",
    header: false,
    showHeader: true,
    timeFormat: 12,
    updatePeriod: 5,
    metricOptions: {
      fontSize: "0.95rem",
      valueFontSize: null,
      lineHeight: "1.25rem",
      spacing: 0,
      valueSpacing: 12
    }
  },

  start() {
    this.vehicle = null;
    this.meta = {};
    this.errorMessage = null;
    this.map = null;
    this.marker = null;
    this._tileLayer = null;
    this._root = null;
    this._mapWrap = null;
    this._mapRefreshTimers = [];
    this._mapInitTimer = null;
    this._mapObserver = null;
    this._visObserver = null;
    this.lastRenderTimestamp = 0;
    this.nextRenderTimer = null;
    if (this.config.showHeader === false && this.data) {
      this.data.header = undefined;
    }
    this.config.carID = this.resolveCarID();
    this.logLine("starting");
    this.sendSocketNotification("TML_CONFIG", this.getPayloadConfig());
  },

  resolveCarID() {
    const topic = String(this.config.mqttTopic || "").trim();
    const fromTopic = topic.match(/cars\/([^/]+)/i);
    if (fromTopic) {
      return String(fromTopic[1]);
    }
    return String(this.config.carID || "1");
  },

  notificationReceived(notification) {
    if (notification === "DOM_OBJECTS_CREATED") {
      this.sendSocketNotification("TML_CONFIG", this.getPayloadConfig());
      this.watchModuleVisibility();
    } else if (notification === "SCENES_CHANGED") {
      this.scheduleMapRefresh();
    }
  },

  suspend() {
    this.cancelMapRefresh();
    this.logLine("suspended (MQTT stays connected)");
  },

  resume() {
    this.logLine("resumed");
    if (this._mapWrap && !this.map) {
      this.initLeafletMap(this._mapWrap);
    }
    this.updateDom(0);
    this.scheduleMapRefresh();
  },

  getPayloadConfig() {
    return {
      identifier: this.identifier,
      displayName: this.config.displayName,
      demo: this.config.demo,
      carID: String(this.config.carID || "1"),
      mqttServer: this.config.mqttServer,
      mqttServerAddress: this.config.mqttServerAddress,
      mqttServerPort: this.config.mqttServerPort,
      mqttServerUser: this.config.mqttServerUser,
      mqttServerPassword: this.config.mqttServerPassword,
      mqttTopic: this.config.mqttTopic,
      mqttNamespace: this.config.mqttNamespace
    };
  },

  getScripts() {
    return ["https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"];
  },

  getStyles() {
    return [
      "MMM-TeslamateWithLocation.css",
      "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
      "https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css"
    ];
  },

  socketNotificationReceived(notification, payload) {
    if (!this.payloadIsForThis(payload)) {
      return;
    }
    if (notification === "TML_VEHICLE") {
      this.vehicle = payload.vehicle;
      this.meta = payload.meta || {};
      this.errorMessage = null;
      this.triggerDomUpdate();
    } else if (notification === "TML_ERROR") {
      this.errorMessage = payload.message;
      if (payload.vehicle) {
        this.vehicle = payload.vehicle;
      }
      this.triggerDomUpdate();
    }
  },

  triggerDomUpdate() {
    const periodMs = Math.max(0, Number(this.config.updatePeriod || 0) * 1000);
    if (!this.lastRenderTimestamp || Date.now() - this.lastRenderTimestamp >= periodMs) {
      this.updateDom(0);
      this.lastRenderTimestamp = Date.now();
      return;
    }
    if (!this.nextRenderTimer) {
      const wait = periodMs - (Date.now() - this.lastRenderTimestamp);
      this.nextRenderTimer = setTimeout(() => {
        this.nextRenderTimer = null;
        this.updateDom(0);
        this.lastRenderTimestamp = Date.now();
      }, Math.max(50, wait));
    }
  },

  getDom() {
    if (!this._root) {
      this._root = document.createElement("div");
      this._root.className = "tml";
    }
    this.render(this._root);
    this.watchModuleVisibility();
    return this._root;
  },

  render(root) {
    const keptMap = this._mapWrap;
    if (keptMap && keptMap.parentNode) {
      keptMap.parentNode.removeChild(keptMap);
    }
    root.innerHTML = "";
    root.style.width = `${this.config.sizeOptions.width || 450}px`;

    if (!this.vehicle) {
      this.teardownMap();
      const loading = document.createElement("div");
      loading.className = "tml-loading";
      loading.innerHTML = '<span class="mdi mdi-car-connected"></span> Connecting to Teslamate MQTT…';
      if (this.errorMessage) {
        loading.textContent = this.errorMessage;
      }
      root.appendChild(loading);
      return;
    }

    root.appendChild(this.buildGraphic());
    if (this.config.hybridView) {
      root.appendChild(this.buildMetrics());
    }
    if (this.config.showMap) {
      root.appendChild(this.buildMap());
    } else {
      this.teardownMap();
    }
    if (this.errorMessage) {
      const err = document.createElement("div");
      err.className = "tml-error";
      err.textContent = this.errorMessage;
      root.appendChild(err);
    }
  },

  buildGraphic() {
    const v = this.vehicle;
    const width = this.config.sizeOptions.width || 450;
    const carHeight = this.config.sizeOptions.height || 175;
    const wrap = document.createElement("div");
    wrap.className = "tml-graphic";
    wrap.style.width = `${width}px`;
    wrap.style.marginTop = `${this.config.sizeOptions.topOffset || 0}px`;

    const hud = document.createElement("div");
    hud.className = "tml-hud";

    const title = document.createElement("div");
    title.className = "tml-title";
    title.textContent = v.displayName || "Tesla";
    if (this.shouldShowGraphicHeader()) {
      hud.appendChild(title);
    }

    const useRange = this.wantsRangeDisplay();
    const big = document.createElement("div");
    big.className = "tml-soc";
    big.innerHTML = `<span class="tml-soc-number">${this.escape(this.primaryNumber(v, useRange))}</span><span class="tml-soc-unit">${this.escape(this.primaryUnit(v, useRange))}</span>`;

    const icons = document.createElement("div");
    icons.className = "tml-status-icons";
    if (v.state === "offline") {
      icons.classList.add("is-offline");
    }
    this.statusIcons(v).forEach((name) => {
      const i = document.createElement("span");
      i.className = `mdi ${name}`;
      icons.appendChild(i);
    });

    const socRow = document.createElement("div");
    socRow.className = "tml-soc-row";
    socRow.appendChild(big);
    hud.appendChild(socRow);
    hud.appendChild(icons);

    const net = document.createElement("div");
    net.className = "tml-network-icons";
    const tempMargin = this.config.displayOptions?.temperatureIcons?.topMargin;
    if (tempMargin) {
      net.style.marginTop = `${tempMargin}px`;
    }
    const temps = this.buildTemps(v);
    if (temps) {
      net.appendChild(temps);
    }
    this.networkIcons(v).forEach((item) => {
      const i = document.createElement("span");
      i.className = `mdi ${item.name}${item.alert ? " is-alert" : ""}`;
      net.appendChild(i);
    });
    hud.appendChild(net);
    wrap.appendChild(hud);

    const stage = document.createElement("div");
    stage.className = "tml-car-stage";
    stage.style.maxHeight = `${carHeight}px`;
    const imgUrl = this.resolveCarImage();
    if (imgUrl) {
      const img = document.createElement("img");
      img.className = "tml-car-image";
      img.src = imgUrl;
      img.alt = v.displayName || "Tesla";
      const scale = this.config.carImageOptions?.scale ?? 1;
      const offset = this.config.carImageOptions?.verticalOffset ?? 0;
      const opacity = this.config.carImageOptions?.opacity ?? this.config.carImageOptions?.imageOpacity ?? 0.9;
      img.style.opacity = String(opacity);
      if (scale !== 1) {
        img.style.transform = `scale(${scale})`;
        img.style.transformOrigin = "center center";
      }
      if (offset) {
        img.style.objectPosition = `center calc(50% + ${offset}px)`;
      }
      stage.appendChild(img);
    }
    wrap.appendChild(stage);

    const bottom = document.createElement("div");
    bottom.className = "tml-graphic-bottom";
    const batTop = this.config.displayOptions?.batteryBar?.topMargin;
    if (batTop) {
      bottom.style.marginTop = `${batTop}px`;
    }
    if (this.config.displayOptions?.batteryBar?.visible !== false) {
      bottom.appendChild(this.buildBatteryBar(v));
    }
    wrap.appendChild(bottom);
    return wrap;
  },

  buildTemps(v) {
    if (!this.shouldShowTemps(v)) {
      return null;
    }
    const temps = document.createElement("div");
    temps.className = "tml-temps";
    if (v.insideTempC !== null && v.insideTempC !== undefined) {
      temps.innerHTML += `<span class="mdi mdi-car"></span>${this.escape(this.formatTemp(v.insideTempC))}`;
    }
    if (v.outsideTempC !== null && v.outsideTempC !== undefined) {
      temps.innerHTML += `<span class="mdi mdi-thermometer"></span>${this.escape(this.formatTemp(v.outsideTempC))}`;
    }
    return temps.childNodes.length ? temps : null;
  },

  buildBatteryBar(v) {
    const usable = Number(v.batteryUsable ?? v.batteryLevel);
    const total = Number(v.batteryLevel ?? v.batteryUsable);
    const valid = Number.isFinite(usable) && usable >= 0 && usable <= 100;
    const level = valid ? usable : 0;
    const reserve = Number.isFinite(total) ? Math.max(0, total - level) : 0;
    const reserveVisible = reserve > 1;
    const target = v.chargeTarget !== null && v.chargeTarget !== undefined ? Math.max(0, Math.min(100, Number(v.chargeTarget))) : null;
    const batWidth = this.config.sizeOptions?.batWidth || this.config.sizeOptions?.batWitdh || 250;
    const batHeight = this.config.sizeOptions?.batHeight || 45;

    const bar = document.createElement("div");
    bar.className = "tml-battery-bar";
    if (v.charging) {
      bar.classList.add("is-charging");
    }

    const shell = document.createElement("div");
    shell.className = "tml-battery-shell";
    shell.style.width = `${batWidth}px`;
    shell.style.height = `${batHeight}px`;

    const well = document.createElement("div");
    well.className = "tml-battery-well";

    const fill = document.createElement("div");
    fill.className = "tml-battery-fill";
    fill.style.width = `${level}%`;
    well.appendChild(fill);

    if (reserveVisible) {
      const cold = document.createElement("div");
      cold.className = "tml-battery-reserve";
      cold.style.left = `${level}%`;
      cold.style.width = `${reserve}%`;
      well.appendChild(cold);
    }

    if (target !== null) {
      const tick = document.createElement("div");
      tick.className = "tml-battery-target";
      tick.style.left = `${target}%`;
      tick.title = `Charge limit ${target}%`;
      well.appendChild(tick);
    }

    const overlay = document.createElement("div");
    overlay.className = "tml-battery-overlay";
    const socLine = document.createElement("div");
    socLine.className = "tml-battery-soc";
    if (v.charging) {
      const bolt = document.createElement("span");
      bolt.className = "mdi mdi-lightning-bolt tml-battery-bolt";
      socLine.appendChild(bolt);
    } else if (reserveVisible) {
      const flake = document.createElement("span");
      flake.className = "mdi mdi-snowflake tml-battery-snowflake";
      socLine.appendChild(flake);
    }
    const num = document.createElement("span");
    num.className = "tml-battery-soc-number";
    num.textContent = valid ? String(Math.round(level)) : "--";
    const unit = document.createElement("span");
    unit.className = "tml-battery-soc-unit";
    unit.textContent = "%";
    socLine.appendChild(num);
    socLine.appendChild(unit);
    overlay.appendChild(socLine);
    if (this.hasPlugVoltage(v)) {
      const volts = document.createElement("div");
      volts.className = "tml-battery-voltage";
      volts.textContent = this.formatPlugVoltage(v);
      overlay.appendChild(volts);
    }
    well.appendChild(overlay);

    const nub = document.createElement("div");
    nub.className = "tml-battery-nub";
    shell.appendChild(well);
    shell.appendChild(nub);
    bar.appendChild(shell);
    return bar;
  },

  buildMetrics() {
    const v = this.vehicle;
    const list = document.createElement("ul");
    list.className = "tml-metrics";
    this.applyMetricStyles(list);

    if (v.charging && this.config.displayOptions?.chargeAdded?.visible !== false) {
      if (v.chargeEnergyAdded !== null && v.chargeEnergyAdded !== undefined) {
        this.addMetric(list, "mdi-lightning-bolt", "Charge added", `${Number(v.chargeEnergyAdded).toFixed(1)} kWh`);
      }
      if (v.timeToFullCharge !== null && v.timeToFullCharge !== undefined) {
        const limit = v.chargeLimitSoc != null ? Math.round(v.chargeLimitSoc) : "limit";
        this.addMetric(list, "mdi-clock-outline", `Time to ${limit}%`, this.formatHours(v.timeToFullCharge));
      }
    } else if (v.pluggedIn && this.hasScheduledChargeStart(v)) {
      this.addMetric(list, "mdi-clock-start", "Scheduled charge", this.formatScheduledStart(v.scheduledChargeStart));
    }

    if (this.config.displayOptions?.odometer?.visible !== false && v.odometerKm !== null && v.odometerKm !== undefined) {
      this.addMetric(list, "mdi-counter", "Odometer", this.formatDistance(v.odometerKm));
    }

    if (this.config.displayOptions?.chargeTarget?.visible !== false && v.chargeLimitSoc !== null && v.chargeLimitSoc !== undefined) {
      this.addMetric(list, "mdi-battery-charging-80", "Charge target", `${Math.round(v.chargeLimitSoc)}%`);
    }

    if (this.config.displayOptions?.tpms?.visible !== false && v.tires && v.tires.count) {
      const unit = this.config.imperial ? "psi" : "bar";
      const parts = ["fl", "fr", "rl", "rr"]
        .filter((k) => v.tires[k] !== null && v.tires[k] !== undefined)
        .map((k) => this.formatTire(v.tires[k]));
      this.addMetric(list, "mdi-car-tire-alert", "Tires", `${parts.join(" · ")} ${unit}`);
    }

    if (this.config.displayOptions?.geofence?.visible !== false && v.geofence) {
      this.addMetric(list, "mdi-map-marker", "Location", String(v.geofence));
    }

    if ((this.config.displayOptions?.speed?.visible !== false) && v.state === "driving") {
      this.addMetric(list, "mdi-speedometer", "Speed", this.formatSpeed(v.speed));
    }

    const updatedAt = v.lastUpdated;
    if (updatedAt) {
      const when = new Date(updatedAt);
      if (!Number.isNaN(when.getTime())) {
        const stale = v.healthy === false || Boolean(this.errorMessage);
        this.addMetric(list, "mdi-update", "Updated", this.formatClock(when), { stale });
      }
    }

    return list;
  },

  addMetric(list, icon, name, value, options) {
    const li = document.createElement("li");
    li.className = options?.stale ? "tml-metric is-stale" : "tml-metric";
    if (options?.title) {
      li.title = options.title;
    }
    li.innerHTML = `<span class="icon mdi ${icon}"></span><span class="name">${this.escape(name)}</span><span class="value">${this.escape(value)}</span>`;
    list.appendChild(li);
  },

  shouldShowGraphicHeader() {
    if (this.config.showHeader === false) {
      return false;
    }
    return !this.data?.header;
  },

  applyMetricStyles(list) {
    const opts = this.config.metricOptions || {};
    const sizeOpts = this.config.sizeOptions || {};
    const fontSize = this.cssSize(opts.fontSize || sizeOpts.fontSize, "0.95rem");
    const valueSize = this.cssSize(opts.valueFontSize, fontSize);
    const lineHeight = this.cssSize(opts.lineHeight || sizeOpts.lineHeight, "1.25rem");
    const rowGap = this.cssSize(opts.spacing, "0px");
    const valueGap = this.cssSize(opts.valueSpacing, "12px");
    list.style.setProperty("--tml-metric-font-size", fontSize);
    list.style.setProperty("--tml-metric-value-size", valueSize);
    list.style.setProperty("--tml-metric-line-height", lineHeight);
    list.style.setProperty("--tml-metric-row-gap", rowGap);
    list.style.setProperty("--tml-metric-value-gap", valueGap);
  },

  cssSize(value, fallback) {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return `${value}px`;
    }
    return String(value);
  },

  mapBoxHeight() {
    return this.config.mapHeight || this.config.height || "220px";
  },

  mapBoxWidth() {
    return this.config.mapWidth || this.config.width || "100%";
  },

  buildMap() {
    const v = this.vehicle;
    const lat = Number(v.latitude);
    const lng = Number(v.longitude);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
    if (!hasCoords || typeof window.L === "undefined") {
      this.teardownMap();
      const wrap = document.createElement("div");
      wrap.className = "tml-map-wrap tml-map-empty";
      wrap.style.width = this.mapBoxWidth();
      wrap.style.height = this.mapBoxHeight();
      wrap.textContent = !hasCoords ? "Location unavailable" : "Loading map…";
      return wrap;
    }

    if (this._mapWrap && this._mapWrap.querySelector(".tml-map")) {
      this.applyMapWrapSize(this._mapWrap);
      if (this.map) {
        this.syncMapPosition(lat, lng);
        if (this.hidden || !this.mapHasSize(this.map)) {
          this.scheduleMapRefresh();
        }
      } else {
        this.initLeafletMap(this._mapWrap);
      }
      return this._mapWrap;
    }

    const wrap = document.createElement("div");
    wrap.className = "tml-map-wrap";
    this.applyMapWrapSize(wrap);
    const mapLook = this.resolveMapLook();
    if (mapLook.isLight) {
      wrap.classList.add("tml-map-light-tiles");
    }
    const tileFilter = mapLook.mapTileFilter;
    if (tileFilter) {
      wrap.classList.add("tml-map-dark-tiles");
      if (typeof tileFilter === "string") {
        wrap.style.setProperty("--tml-map-tile-filter", tileFilter);
      }
    }
    const mapEl = document.createElement("div");
    mapEl.className = "tml-map";
    wrap.appendChild(mapEl);
    this._mapWrap = wrap;
    this.initLeafletMap(wrap);
    return wrap;
  },

  initLeafletMap(wrap) {
    const mapEl = wrap && wrap.querySelector(".tml-map");
    if (!mapEl || typeof window.L === "undefined") {
      return;
    }
    if (this.map) {
      this.scheduleMapRefresh();
      return;
    }
    if (this._mapInitTimer) {
      clearTimeout(this._mapInitTimer);
    }
    let attempts = 0;
    const start = () => {
      this._mapInitTimer = null;
      if (this.map) {
        this.scheduleMapRefresh();
        return;
      }
      if (!mapEl.isConnected) {
        attempts += 1;
        if (attempts > 40) {
          return;
        }
        this._mapInitTimer = setTimeout(start, 150);
        return;
      }
      const lat = Number(this.vehicle?.latitude);
      const lng = Number(this.vehicle?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return;
      }
      const mapLook = this.resolveMapLook();
      try {
        const map = window.L.map(mapEl, {
          zoomControl: false,
          attributionControl: true,
          dragging: false,
          scrollWheelZoom: false,
          doubleClickZoom: false,
          boxZoom: false,
          keyboard: false
        }).setView([lat, lng], this.config.zoomLevel || 16);

        const tileLayer = window.L.tileLayer(mapLook.tileUrl, {
          attribution: mapLook.tileAttribution,
          maxZoom: 19,
          subdomains: mapLook.tileSubdomains
        }).addTo(map);
        if (mapLook.tileLabelUrl) {
          window.L.tileLayer(mapLook.tileLabelUrl, { maxZoom: 19, pane: "overlayPane" }).addTo(map);
        }
        const icon = window.L.divIcon({
          className: "tml-marker",
          html: '<span class="mdi mdi-car"></span>',
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });
        this.marker = window.L.marker([lat, lng], { icon }).addTo(map);
        this._tileLayer = tileLayer;
        this.map = map;
        this.observeMapContainer(wrap);
        this.scheduleMapRefresh();
      } catch (err) {
        this.scheduleMapRefresh();
      }
    };
    this._mapInitTimer = setTimeout(start, 50);
  },

  applyMapWrapSize(wrap) {
    wrap.style.width = this.mapBoxWidth();
    wrap.style.height = this.mapBoxHeight();
  },

  syncMapPosition(lat, lng) {
    const map = this.map;
    if (!map) {
      return;
    }
    try {
      map.setView([lat, lng], this.config.zoomLevel || 16, { animate: false });
      if (this.marker && typeof this.marker.setLatLng === "function") {
        this.marker.setLatLng([lat, lng]);
      }
    } catch (err) {
      // ignore
    }
  },

  teardownMap() {
    this.cancelMapRefresh();
    this.disconnectMapObserver();
    if (this._mapInitTimer) {
      clearTimeout(this._mapInitTimer);
      this._mapInitTimer = null;
    }
    if (this.map) {
      try {
        this.map.remove();
      } catch (err) {
        // ignore
      }
    }
    this.map = null;
    this.marker = null;
    this._tileLayer = null;
    this._mapWrap = null;
  },

  mapHasSize(map) {
    if (!map || typeof map.getSize !== "function") {
      return false;
    }
    const size = map.getSize();
    return Boolean(size && size.x > 0 && size.y > 0);
  },

  refreshMap() {
    const map = this.map;
    if (!map) {
      return;
    }
    try {
      if (!this.mapHasSize(map)) {
        return;
      }
      map.invalidateSize({ animate: false, pan: false });
      const lat = Number(this.vehicle?.latitude);
      const lng = Number(this.vehicle?.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        this.syncMapPosition(lat, lng);
      }
      if (this._tileLayer && typeof this._tileLayer.redraw === "function") {
        this._tileLayer.redraw();
      }
    } catch (err) {
      // Leaflet throws if the container was detached mid-refresh.
    }
  },

  cancelMapRefresh() {
    for (const timer of this._mapRefreshTimers || []) {
      clearTimeout(timer);
    }
    this._mapRefreshTimers = [];
  },

  scheduleMapRefresh() {
    this.cancelMapRefresh();
    this._mapRefreshTimers = [0, 50, 250, 600, 1100, 1600].map((ms) => setTimeout(() => this.refreshMap(), ms));
  },

  disconnectMapObserver() {
    if (this._mapObserver) {
      this._mapObserver.disconnect();
      this._mapObserver = null;
    }
  },

  observeMapContainer(el) {
    this.disconnectMapObserver();
    if (!el || typeof ResizeObserver === "undefined") {
      return;
    }
    this._mapObserver = new ResizeObserver(() => this.refreshMap());
    this._mapObserver.observe(el);
  },

  watchModuleVisibility() {
    const node = this._root && this._root.closest ? this._root.closest(".module") : null;
    if (!node || typeof MutationObserver === "undefined") {
      return;
    }
    if (this._visObserver) {
      return;
    }
    this._visObserver = new MutationObserver(() => {
      if (!this.hidden) {
        this.scheduleMapRefresh();
      }
    });
    this._visObserver.observe(node, { attributes: true, attributeFilter: ["class", "style"] });
  },

  isLightMapStyle() {
    const style = String(this.config.mapStyle || "dark").toLowerCase().replace(/[\s_-]/g, "");
    return style === "light" || style === "teslamate" || style === "teslamatelocation";
  },

  resolveMapLook() {
    const isLight = this.isLightMapStyle();
    return {
      isLight,
      tileUrl: this.config.tileUrl || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      tileAttribution: this.config.tileAttribution || "&copy; OpenStreetMap contributors",
      tileSubdomains: this.config.tileSubdomains || "abc",
      tileLabelUrl: this.config.tileLabelUrl || null,
      mapTileFilter: isLight ? false : this.config.mapTileFilter
    };
  },

  resolveCarImage() {
    const configured = this.config.carImage;
    if (configured === false || configured === "none") {
      return null;
    }
    const aliases = {
      m3: "images/cars/tesla-model-3-2018-pearl-white.png",
      model3: "images/cars/tesla-model-3-2018-pearl-white.png",
      "model-3": "images/cars/tesla-model-3-2018-pearl-white.png",
      "3": "images/cars/tesla-model-3-2018-pearl-white.png",
      my: "images/cars/tesla-model-y-2023-performance-deep-blue.png",
      modely: "images/cars/tesla-model-y-2023-performance-deep-blue.png",
      "model-y": "images/cars/tesla-model-y-2023-performance-deep-blue.png",
      "y": "images/cars/tesla-model-y-2023-performance-deep-blue.png",
      performance: "images/cars/tesla-model-y-2023-performance-deep-blue.png"
    };
    if (typeof configured === "string" && aliases[configured.toLowerCase()]) {
      return this.file(aliases[configured.toLowerCase()]);
    }
    if (typeof configured === "string" && configured.length) {
      if (/^(https?:)?\/\//i.test(configured) || configured.startsWith("/")) {
        return configured;
      }
      return this.file(configured);
    }
    const blob = `${this.config.displayName || ""} ${this.vehicle?.model || ""} ${this.vehicle?.displayName || ""}`.toLowerCase();
    if (/model y|\by\b|performance/.test(blob) && !/model 3/.test(blob)) {
      return this.file(aliases.my);
    }
    if (/model 3|\bm3\b/.test(blob)) {
      return this.file(aliases.m3);
    }
    if (String(this.config.carID) === "2") {
      return this.file(aliases.my);
    }
    const opts = this.config.carImageOptions || {};
    if (opts.model && opts.options) {
      const view = opts.view || "STUD_3QTR";
      return `https://static-assets.tesla.com/v1/compositor/?model=${encodeURIComponent(opts.model)}&view=${encodeURIComponent(view)}&size=1440&options=${encodeURIComponent(opts.options)}&bkba_opt=1`;
    }
    return this.file(aliases.m3);
  },

  statusIcons(v) {
    const icons = [];
    const state = String(v.state || "").toLowerCase();
    if (state === "asleep" || state === "suspended") {
      icons.push("mdi-power-sleep");
    }
    if (state === "suspended") {
      icons.push("mdi-timer-sand");
    }
    if (state === "driving") {
      icons.push("mdi-steering");
    }
    if (v.charging) {
      icons.push("mdi-lightning-bolt");
    }
    if (v.pluggedIn) {
      icons.push("mdi-power-plug");
    }
    if (v.locked === false) {
      icons.push("mdi-lock-open-variant");
    }
    if (v.sentry) {
      icons.push("mdi-cctv");
    }
    if (v.windowsOpen) {
      icons.push("mdi-window-open");
    }
    if (v.userPresent) {
      icons.push("mdi-account");
    }
    if (v.doorsOpen || v.trunkOpen || v.frunkOpen) {
      icons.push("mdi-car-door");
    }
    if (v.climateOn || v.preconditioning) {
      icons.push("mdi-air-conditioner");
    }
    return icons;
  },

  networkIcons(v) {
    const icons = [];
    const state = String(v.state || "").toLowerCase();
    if (state === "updating") {
      icons.push({ name: "mdi-cog-clockwise" });
    } else if (v.updateAvailable) {
      icons.push({ name: "mdi-gift" });
    }
    if (v.healthy === false) {
      icons.push({ name: "mdi-alert-box", alert: true });
    }
    icons.push({ name: state === "offline" || this.errorMessage ? "mdi-signal-off" : "mdi-signal" });
    return icons;
  },

  shouldShowTemps(v) {
    if (this.config.displayOptions?.temperatures?.visible === false) {
      return false;
    }
    if (this.config.showTemps === "never") {
      return false;
    }
    const hvac = Boolean(v.climateOn || v.preconditioning);
    if (this.config.showTemps === "hvac_on" && !hvac) {
      return false;
    }
    return v.insideTempC !== null && v.insideTempC !== undefined || v.outsideTempC !== null && v.outsideTempC !== undefined;
  },

  payloadIsForThis(payload) {
    if (!payload) {
      return false;
    }
    const myId = String(this.identifier || "");
    const theirId = String(payload.identifier || "");
    if (myId && theirId && myId !== theirId) {
      return false;
    }
    const myCar = String(this.config.carID || "").trim();
    const theirCar = String(payload.carID || payload.vehicle?.carID || "").trim();
    if (myCar && theirCar && myCar !== theirCar) {
      return false;
    }
    return Boolean((myId && theirId && myId === theirId) || (myCar && theirCar && myCar === theirCar));
  },

  wantsRangeDisplay() {
    const s = String(this.config.rangeDisplay ?? "").trim().toLowerCase();
    if (!s || s === "%" || s === "soc" || s === "percent" || s === "percentage" || s === "battery") {
      return false;
    }
    return s === "range" || s === "mi" || s === "km" || s === "miles" || s === "distance" || s.includes("range");
  },

  primaryNumber(v, useRange) {
    if (useRange) {
      const km = v.idealRangeKm ?? v.rangeKm ?? v.ratedRangeKm ?? v.estRangeKm;
      if (km !== null && km !== undefined) {
        return this.config.imperial ? Math.round(Number(km) / 1.609344) : Math.round(Number(km));
      }
      return "--";
    }
    const soc = Number(v.batteryUsable ?? v.batteryLevel);
    if (Number.isFinite(soc) && soc >= 0 && soc <= 100) {
      return Math.round(soc);
    }
    return "--";
  },

  primaryUnit(v, useRange) {
    if (useRange) {
      return this.config.imperial ? "mi" : "km";
    }
    return "%";
  },

  formatDistance(km) {
    if (km === null || km === undefined) {
      return "--";
    }
    if (this.config.imperial) {
      return `${Math.round(Number(km) / 1.609344).toLocaleString()} mi`;
    }
    return `${Math.round(Number(km)).toLocaleString()} km`;
  },

  formatSpeed(kmh) {
    if (kmh === null || kmh === undefined || !Number.isFinite(Number(kmh))) {
      return "--";
    }
    if (this.config.imperial) {
      return `${Math.round(Number(kmh) / 1.609344)} mph`;
    }
    return `${Math.round(Number(kmh))} km/h`;
  },

  formatTemp(c) {
    if (this.config.imperial) {
      return `${Math.round((Number(c) * 9) / 5 + 32)}°F`;
    }
    return `${Math.round(Number(c))}°C`;
  },

  formatTire(bar) {
    const n = Number(bar);
    if (!Number.isFinite(n)) {
      return "--";
    }
    if (this.config.imperial) {
      return (n * 14.503773773).toFixed(0);
    }
    return n.toFixed(1);
  },

  hasPlugVoltage(v) {
    const n = Number(v.plugVoltage ?? v.chargerVoltage);
    return Number.isFinite(n) && n > 0;
  },

  formatPlugVoltage(v) {
    const n = Number(v.plugVoltage ?? v.chargerVoltage);
    const text = Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1);
    return `${text} V`;
  },

  hasScheduledChargeStart(v) {
    const s = String(v.scheduledChargeStart || "").trim();
    if (!s) {
      return false;
    }
    return !/^(NA|N\/A|NONE|NULL|NIL|NOT.?SET|UNAVAILABLE|UNKNOWN|--)$/i.test(s);
  },

  formatClock(value) {
    const when = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(when.getTime())) {
      return "";
    }
    const twentyFour = this.config.timeFormat === 24 || this.config.timeFormat === "24";
    if (twentyFour) {
      return when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
    }
    return when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  },

  formatScheduledStart(value) {
    const s = String(value).trim();
    const isoish = new Date(s);
    if (!Number.isNaN(isoish.getTime()) && /\d{4}-\d{2}-\d{2}|T\d/.test(s)) {
      const diffMs = isoish.getTime() - Date.now();
      if (diffMs > 0) {
        return this.formatHours(diffMs / 3600000);
      }
      return this.formatClock(isoish);
    }
    const hm = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (hm) {
      const d = new Date();
      d.setHours(Number(hm[1]), Number(hm[2]), 0, 0);
      return this.formatClock(d);
    }
    return s;
  },

  formatHours(remHrs) {
    const n = Number(remHrs);
    if (!Number.isFinite(n) || n <= 0) {
      return "0 min";
    }
    const hrs = Math.floor(n);
    const mins = Math.ceil((n - hrs) * 60);
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    return `${mins} min`;
  },

  logLine(message) {
    const name = this.config.displayName || `car ${this.config.carID || "?"}`;
    console.log(`${this.name} [${this.identifier}] ${name} ${message}`);
  },

  escape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
});
