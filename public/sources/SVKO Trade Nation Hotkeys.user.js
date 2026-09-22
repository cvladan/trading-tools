// ==UserScript==
// @name         Trade Nation Hotkeys - Market Buy/Sell
// @namespace    https://github.com/cvladan/svko-hougaard-trading
// @version      0.6.9
// @description  Manual Violentmonkey userscript hotkeys (Firefox/Chrome) and read-only position/SL/TP chart overlay for Trade Nation.
// @match        https://chart.tradenation.com/*
// @match        https://demochart.tradenation.com/*
// @match        https://chart-cfd.tradenation.com/*
// @match        https://chart.tradedirect365.com/*
// @match        https://demochart.tradedirect365.com/*
// @match        https://chart.tradedirect365.com.au/*
// @match        https://demochart.tradedirect365.com.au/*
// @run-at       document-idle
// @grant        unsafeWindow
// @license      LicenseRef-SVKO-Personal-Use-Commercial-1.0; https://trading.cvladan.com/licences/SVKO-1.0.txt
// ==/UserScript==
// Copyright (c) 2026 Vladan Colovic (SVKO).
// SVKO Personal Use and Commercial Licence 1.0.
// Free personal use includes trading real money for your own profit.
// Company, employment and other business use requires a separate paid licence.
// Terms: https://trading.cvladan.com/licences/SVKO-1.0.txt
// Third-party material retains its own licence.

(function () {
  "use strict";

  const page = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

  const CONFIG = {
    DEMO_ONLY: false,
    STAKE: "0.5",
    STOP_DISTANCE_POINTS: 10,
    BREAKEVEN_OFFSET_POINTS: 1,
    TAKE_PROFIT_TOUCH_OFFSET_POINTS: 1,
    LIMIT_DISTANCE_POINTS: 0,
    COOLDOWN_MS: 750,
    RUNTIME_WAIT_MS: 3500,
    BOOTSTRAP_POLL_MS: 500,
    MAINTENANCE_REFRESH_MS: 2500,
    SHOW_TRADE_OVERLAY: true,
    DEBUG_TRADE_OVERLAY: false,
    TRADE_OVERLAY_CURRENT_MARKET_ONLY: true,
    TRADE_OVERLAY_FALLBACK_TO_ALL_POSITIONS: true,
    TRADE_OVERLAY_REFRESH_MS: 350,
    TRADE_OVERLAY_ACCOUNT_REFRESH_MS: 1000,
    TRADE_OVERLAY_STATUS_BADGE: true,
    CLOSE_ALL_CURRENT_MARKET_ONLY: true,
    BUY_HOTKEY: { ctrlKey: true, altKey: true, shiftKey: false, code: "KeyB" },
    SELL_HOTKEY: { ctrlKey: true, altKey: true, shiftKey: false, code: "KeyS" },
    BREAKEVEN_HOTKEY: { ctrlKey: true, altKey: true, shiftKey: false, code: "KeyE" },
    TAKE_PROFIT_HOTKEY: { ctrlKey: true, altKey: true, shiftKey: false, code: "KeyT" },
    CLOSE_HOTKEY: { ctrlKey: true, altKey: true, shiftKey: false, code: "KeyX" },
    CLOSE_ALL_HOTKEY: { ctrlKey: true, altKey: true, shiftKey: false, code: "KeyA" },
  };

  let lastTradeAt = 0;
  let lastOpenedPositionId = null;
  let lastStateRefreshAt = 0;
  let bootstrapTimer = null;
  let maintenanceTimer = null;
  let tradeOverlayTimer = null;
  let tradeOverlayAccountRefreshTimer = null;
  let tradeOverlayStyle = null;
  let tradeOverlayDrawHookInstalled = false;
  let chartEngineInstance = null;
  let tradeOverlayRuntimeTapInstalled = false;
  let tradeOverlayDisabledByExtension = false;
  let tradeOverlayStartupCheckDone = false;
  let tradeOverlayPositionRecordsCache = null;
  let tradeOverlayStatusBadge = null;
  const tradeOverlayLines = new Map();
  const lastTradeOverlayDebugSignatures = new Map();
  const lastMouse = { x: 0, y: 0 };

  function getQueryParam(name) {
    if (typeof page.qsParmNew === "function") return page.qsParmNew(name);
    return new URLSearchParams(page.location.search).get(name);
  }

  function isDemoPage() {
    return page.location.hostname.toLowerCase().includes("demo");
  }

  function assertDemoAllowed() {
    if (CONFIG.DEMO_ONLY && !isDemoPage()) {
      throw new Error("DEMO_ONLY is enabled. Open demochart or set DEMO_ONLY to false.");
    }
  }

  function matchesHotkey(event, hotkey) {
    return (
      event.code === hotkey.code &&
      event.ctrlKey === hotkey.ctrlKey &&
      event.altKey === hotkey.altKey &&
      event.shiftKey === hotkey.shiftKey &&
      !event.metaKey
    );
  }

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName ? target.tagName.toLowerCase() : "";
    return (
      target.isContentEditable ||
      tag === "input" ||
      tag === "textarea" ||
      tag === "select"
    );
  }

  function notify(message, isError = false) {
    console[isError ? "error" : "log"](`[TN hotkeys] ${message}`);

    let box = document.getElementById("tn-hotkeys-status");
    if (!box) {
      box = document.createElement("div");
      box.id = "tn-hotkeys-status";
      box.style.cssText = [
        "position:fixed",
        "right:12px",
        "bottom:12px",
        "z-index:2147483647",
        "font:13px Arial,sans-serif",
        "padding:8px 10px",
        "border-radius:4px",
        "color:#fff",
        "box-shadow:0 2px 8px rgba(0,0,0,.25)",
        "pointer-events:none",
      ].join(";");
      document.documentElement.appendChild(box);
    }

    box.textContent = message;
    box.style.background = isError ? "#b00020" : "#146c43";
    box.style.display = "block";
    clearTimeout(box._hideTimer);
    box._hideTimer = setTimeout(() => {
      box.style.display = "none";
    }, 3500);
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getTradingObjects(options = {}) {
    const requireRequestTrade = options.requireRequestTrade !== false;
    const wsuts = page.TradingPlatform && page.TradingPlatform.WSUTS;
    const instance = wsuts && (wsuts._staticInstance || wsuts);
    const requestTrade = instance && instance.RequestTrade;

    if (!wsuts || !instance) {
      throw new Error("TradingPlatform.WSUTS is not available yet.");
    }

    if (requireRequestTrade && typeof requestTrade !== "function") {
      throw new Error("TradingPlatform.WSUTS.RequestTrade is not available yet.");
    }

    return { wsuts, instance, requestTrade };
  }

  async function waitForTradingObjects(options = {}) {
    const startedAt = Date.now();
    let lastError = null;

    while (Date.now() - startedAt <= CONFIG.RUNTIME_WAIT_MS) {
      try {
        return getTradingObjects(options);
      } catch (error) {
        lastError = error;
        refreshRuntimeState(true);
        await delay(150);
      }
    }

    throw lastError || new Error("Trading runtime is not available yet.");
  }

  function isTradeFromChartExtensionPresent() {
    return (
      typeof page.chartIQPositionLine === "function" ||
      typeof page.chartIQOrderLine === "function" ||
      typeof page.tfcloaded !== "undefined" ||
      typeof page.objectMapPositions !== "undefined" ||
      Boolean(
        document.querySelector(
          ".tfc.orderline, [id^='positionline-'], [id^='protectionorderline-']",
        ),
      )
    );
  }

  function isTradeFromChartOverlayPresent() {
    return isTradeFromChartExtensionPresent();
  }

  function runTradeOverlayStartupCheck() {
    if (tradeOverlayStartupCheckDone) return;
    tradeOverlayStartupCheckDone = true;

    tradeOverlayDisabledByExtension = isTradeFromChartExtensionPresent() || isTradeFromChartOverlayPresent();
    if (tradeOverlayDisabledByExtension) {
      console.log(
        "[TN hotkeys] Trade From Chart extension detected. Userscript overlay is off; hotkeys remain active.",
      );
    }
  }

  function debugTradeOverlay(reason, details = {}) {
    if (!CONFIG.DEBUG_TRADE_OVERLAY) return;

    const signature = JSON.stringify(details);
    if (signature === lastTradeOverlayDebugSignatures.get(reason)) return;
    lastTradeOverlayDebugSignatures.set(reason, signature);
    console.debug("[TN hotkeys overlay]", reason, details);
  }

  function ensureTradeOverlayStyle() {
    if (tradeOverlayStyle) return;

    tradeOverlayStyle = document.createElement("style");
    tradeOverlayStyle.id = "tn-hotkeys-trade-overlay-style";
    tradeOverlayStyle.textContent = `
      .tn-hotkeys-chart-line {
        position: fixed;
        left: 0;
        width: 0;
        height: 0;
        display: block;
        pointer-events: none;
        z-index: 2147483600;
        font: 11px Arial, sans-serif;
        letter-spacing: 0;
      }
      .tn-hotkeys-chart-line__stroke {
        position: absolute;
        left: 0;
        right: 0;
        top: 0;
        height: 0;
        border-top: 1px solid var(--tn-line-color);
        box-shadow: 0 0 0 1px rgba(0, 0, 0, .12);
      }
      .tn-hotkeys-chart-line--entry .tn-hotkeys-chart-line__stroke {
        border-top-width: 2px;
      }
      .tn-hotkeys-chart-line--sl .tn-hotkeys-chart-line__stroke,
      .tn-hotkeys-chart-line--tp .tn-hotkeys-chart-line__stroke {
        border-top-style: dashed;
      }
      .tn-hotkeys-chart-line__label {
        position: absolute;
        right: 8px;
        top: 0;
        transform: translateY(-50%);
        display: inline-flex;
        align-items: center;
        min-height: 18px;
        max-width: min(280px, calc(100vw - 32px));
        padding: 2px 6px;
        border-radius: 3px;
        background: var(--tn-label-bg);
        color: #fff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-shadow: 0 1px 1px rgba(0, 0, 0, .35);
        box-shadow: 0 1px 4px rgba(0, 0, 0, .22);
      }
      #tn-hotkeys-overlay-status {
        position: fixed;
        left: 12px;
        bottom: 12px;
        z-index: 2147483647;
        max-width: min(420px, calc(100vw - 24px));
        padding: 7px 9px;
        border-radius: 4px;
        background: rgba(16, 24, 39, .94);
        color: #fff;
        font: 12px Arial, sans-serif;
        letter-spacing: 0;
        box-shadow: 0 2px 10px rgba(0, 0, 0, .28);
        pointer-events: none;
      }
    `;
    document.documentElement.appendChild(tradeOverlayStyle);
  }

  function setTradeOverlayStatus(message, persistent = false) {
    if (!CONFIG.TRADE_OVERLAY_STATUS_BADGE) return;
    ensureTradeOverlayStyle();

    if (!tradeOverlayStatusBadge || !tradeOverlayStatusBadge.isConnected) {
      tradeOverlayStatusBadge = document.createElement("div");
      tradeOverlayStatusBadge.id = "tn-hotkeys-overlay-status";
      (document.body || document.documentElement).appendChild(tradeOverlayStatusBadge);
    }

    tradeOverlayStatusBadge.textContent = message;
    tradeOverlayStatusBadge.style.display = "block";
    clearTimeout(tradeOverlayStatusBadge._hideTimer);
    if (!persistent) {
      tradeOverlayStatusBadge._hideTimer = setTimeout(() => {
        if (tradeOverlayStatusBadge) tradeOverlayStatusBadge.style.display = "none";
      }, 4500);
    }
  }

  function removeTradeOverlay() {
    for (const element of tradeOverlayLines.values()) {
      element.remove();
    }
    tradeOverlayLines.clear();
  }

  function cacheTradeOverlayPositions(payload) {
    const records = payload && Array.isArray(payload.Records) ? payload.Records : Array.isArray(payload) ? payload : null;
    if (!records) return false;

    tradeOverlayPositionRecordsCache = records;
    debugTradeOverlay("cached-position-records", { records: records.length });
    return true;
  }

  function getFirstArray(...candidates) {
    return candidates.find((candidate) => Array.isArray(candidate)) || null;
  }

  function getAccountPositionRecords() {
    const proxy = page.ConnectionProxy;
    const ticket = page.TradeTicket;

    return getFirstArray(
      proxy && proxy.lastAccountPositions && proxy.lastAccountPositions.Records,
      tradeOverlayPositionRecordsCache,
      proxy && proxy.lastAccountPositions,
      proxy && proxy._positions,
      ticket && ticket._positions,
      ticket && ticket.positions,
      ticket && ticket._currentPositions,
    );
  }

  function getTradeOverlayPositionSnapshot() {
    const records = getAccountPositionRecords();

    if (!Array.isArray(records)) {
      setTradeOverlayStatus("TN overlay: no account position records yet", true);
      debugTradeOverlay("no-position-records", {
        hasConnectionProxy: Boolean(page.ConnectionProxy),
        hasLastAccountPositions: Boolean(page.ConnectionProxy && page.ConnectionProxy.lastAccountPositions),
        hasTradeTicket: Boolean(page.TradeTicket),
      });
      return { records: [], positions: [], usedFallback: false, fid: getQueryParam("FID") };
    }

    const fid = getQueryParam("FID");
    const drawablePositions = records.filter((position) => {
      return (
        position &&
        String(position.Type) === "1" &&
        positionId(position) != null &&
        getPositionEntryPrice(position) != null
      );
    });
    let positions = drawablePositions;
    let usedFallback = false;

    if (CONFIG.TRADE_OVERLAY_CURRENT_MARKET_ONLY) {
      positions = drawablePositions.filter((position) => {
        if (fid == null || fid === "") return false;
        return String(position.MarketID) === String(fid);
      });

      if (!positions.length && CONFIG.TRADE_OVERLAY_FALLBACK_TO_ALL_POSITIONS) {
        positions = drawablePositions;
        usedFallback = true;
      }
    }

    if (!positions.length) {
      setTradeOverlayStatus(
        `TN overlay: ${drawablePositions.length} position records, none for FID ${fid || "?"}`,
        true,
      );
    }

    debugTradeOverlay("position-records", {
      fid,
      totalRecords: records.length,
      drawablePositions: drawablePositions.length,
      matchingPositions: positions.length,
      currentMarketOnly: CONFIG.TRADE_OVERLAY_CURRENT_MARKET_ONLY,
      usedFallback,
    });

    return { records, positions, usedFallback, fid };
  }

  function getTradeOverlayPositions() {
    return getTradeOverlayPositionSnapshot().positions;
  }

  function numericPrice(value, allowZero = false) {
    if (value == null || value === "-" || value === "") return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    if (!allowZero && number === 0) return null;
    return number;
  }

  function getPositionEntryPrice(position) {
    return (
      numericPrice(position.OpeningPrice, true) ??
      numericPrice(position.OpeningPriceDecimal, true) ??
      numericPrice(position.Price, true)
    );
  }

  function getProtectionPrice(position, fieldName) {
    return numericPrice(position[fieldName]);
  }

  function getChartEngine() {
    return page.stxx || chartEngineInstance;
  }

  function getChartPanel(chart) {
    if (!chart) return null;
    const panels = chart.panels;
    if (panels) {
      if (panels.chart) return panels.chart;
      const firstKey = Object.keys(panels)[0];
      if (firstKey) return panels[firstKey];
    }
    return (chart.chart && chart.chart.panel) || null;
  }

  function getChartContainer(chart) {
    if (chart && chart.container && typeof chart.container.getBoundingClientRect === "function") {
      const rect = chart.container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return chart.container;
    }

    let best = null;
    let bestArea = 0;
    document.querySelectorAll(".chartContainer").forEach((element) => {
      const rect = element.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > bestArea) {
        best = element;
        bestArea = area;
      }
    });
    return best;
  }

  function getChartViewport() {
    const chart = getChartEngine();
    const chartContainer = getChartContainer(chart);
    const panel = getChartPanel(chart);

    if (!chart || typeof chart.pixelFromPrice !== "function" || !chartContainer || !panel) {
      return null;
    }

    const rect = chartContainer.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    return { chart, panel, rect };
  }

  function priceToOverlayTop(price, viewport) {
    const top = viewport.chart.pixelFromPrice(Number(price), viewport.panel);
    if (!Number.isFinite(top)) return null;
    return top;
  }

  function getDrawingSettingsOffset() {
    const wrapper = document.querySelector(".drawing-settings-wrapper");
    return wrapper ? Number(wrapper.offsetHeight) || 0 : 0;
  }

  function priceDecimals(value, fallbackText) {
    const configuredDecimals = Number(page.currentPrcGenDecimalPlaces);
    if (Number.isInteger(configuredDecimals) && configuredDecimals >= 0 && configuredDecimals <= 10) {
      return configuredDecimals;
    }

    const [, decimals = ""] = String(fallbackText ?? value).split(".");
    return Math.min(decimals.length, 8);
  }

  function formatOverlayPrice(value, fallbackText) {
    return Number(value).toFixed(priceDecimals(value, fallbackText));
  }

  function positionId(position) {
    return position.PositionID ?? position.PositionId ?? position.ID ?? position.Id;
  }

  function linePalette(kind, direction) {
    if (kind === "sl") return { line: "#f59e0b", label: "rgba(181, 88, 7, .96)" };
    if (kind === "tp") return { line: "#16a34a", label: "rgba(21, 128, 61, .96)" };
    if (direction === "Sell") return { line: "#dc2626", label: "rgba(185, 28, 28, .96)" };
    return { line: "#2563eb", label: "rgba(29, 78, 216, .96)" };
  }

  function buildTradeOverlayItems(positions, viewport) {
    const items = [];

    for (const position of positions) {
      const id = positionId(position);
      const entryPrice = getPositionEntryPrice(position);
      if (id == null || entryPrice == null) continue;

      const direction = position.Direction === "Sell" ? "Sell" : "Buy";
      const directionLabel = direction === "Sell" ? "SHORT" : "LONG";
      const entryTop = priceToOverlayTop(entryPrice, viewport);
      if (entryTop != null) {
        items.push({
          key: `position:${id}:entry`,
          kind: "entry",
          direction,
          top: entryTop,
          rawTop: entryTop,
          label: `${directionLabel} ${position.Stake ?? ""} @ ${formatOverlayPrice(
            entryPrice,
            position.OpeningPrice,
          )}`.replace(/\s+/g, " "),
        });
      }

      const stopPrice = getProtectionPrice(position, "StopOrderPrice");
      const stopTop = stopPrice == null ? null : priceToOverlayTop(stopPrice, viewport);
      if (stopPrice != null && stopTop != null) {
        const isBreakeven = Math.abs(stopPrice - entryPrice) < 1e-9;
        items.push({
          key: `position:${id}:sl`,
          kind: "sl",
          direction,
          top: stopTop,
          rawTop: stopTop,
          label: `${isBreakeven ? "BE" : "SL"} ${formatOverlayPrice(
            stopPrice,
            position.StopOrderPrice,
          )}`,
        });
      }

      const limitPrice = getProtectionPrice(position, "LimitOrderPrice");
      const limitTop = limitPrice == null ? null : priceToOverlayTop(limitPrice, viewport);
      if (limitPrice != null && limitTop != null) {
        items.push({
          key: `position:${id}:tp`,
          kind: "tp",
          direction,
          top: limitTop,
          rawTop: limitTop,
          label: `TP ${formatOverlayPrice(limitPrice, position.LimitOrderPrice)}`,
        });
      }
    }

    return items;
  }

  function tradeOverlayDomId(key) {
    return `tn-hotkeys-${String(key).replace(/[^a-z0-9_-]+/gi, "-")}`;
  }

  function attachTradeOverlayElement(element) {
    (document.body || document.documentElement).appendChild(element);
  }

  function ensureTradeOverlayLine(item) {
    ensureTradeOverlayStyle();

    let line = tradeOverlayLines.get(item.key);
    if (line && line.isConnected) return line;

    line = document.createElement("div");
    line.id = tradeOverlayDomId(item.key);
    line.className = `tn-hotkeys-chart-line tn-hotkeys-chart-line--${item.kind}`;
    line.dataset.tradeOverlayKey = item.key;

    const stroke = document.createElement("div");
    stroke.className = "tn-hotkeys-chart-line__stroke";
    line.appendChild(stroke);

    const label = document.createElement("div");
    label.className = "tn-hotkeys-chart-line__label";
    line.appendChild(label);

    attachTradeOverlayElement(line);
    tradeOverlayLines.set(item.key, line);
    return line;
  }

  function updateTradeOverlayLine(item, viewport) {
    const palette = linePalette(item.kind, item.direction);
    const line = ensureTradeOverlayLine(item);
    const label = line.querySelector(".tn-hotkeys-chart-line__label");
    const topInChart = item.rawTop + getDrawingSettingsOffset();
    const clampedTopInChart = Math.max(0, Math.min(viewport.rect.height, topInChart));
    const outOfView = topInChart < 0 ? "above" : topInChart > viewport.rect.height ? "below" : "";

    line.style.left = `${Math.round(viewport.rect.left)}px`;
    line.style.width = `${Math.round(viewport.rect.width)}px`;
    line.style.top = `${Math.round(viewport.rect.top + clampedTopInChart)}px`;
    line.style.setProperty("--tn-line-color", palette.line);
    line.style.setProperty("--tn-label-bg", palette.label);
    line.style.display = "";
    line.dataset.rawTop = String(item.rawTop);
    line.dataset.topInChart = String(topInChart);

    if (label) label.textContent = outOfView ? `${item.label} (${outOfView})` : item.label;
  }

  function installTradeOverlayDrawHook() {
    if (tradeOverlayDrawHookInstalled) return;

    const ciq = page._CIQ || page.CIQ;
    const chartEngine = ciq && ciq.ChartEngine && ciq.ChartEngine.prototype;
    if (!chartEngine || typeof chartEngine.append !== "function") return;

    chartEngine.append("draw", function tnHotkeysOverlayDraw() {
      if (this) chartEngineInstance = this;
      if (!page.is_dragging) renderTradeOverlay();
    });
    tradeOverlayDrawHookInstalled = true;
    debugTradeOverlay("draw-hook-installed");
  }

  function wrapTradeOverlayRuntimeMethod(owner, methodName, afterCall) {
    if (!owner || typeof owner[methodName] !== "function" || owner[methodName]._tnHotkeysOverlayWrapped) {
      return false;
    }

    const original = owner[methodName];
    owner[methodName] = function tnHotkeysOverlayRuntimeWrapper(...args) {
      const result = original.apply(this, args);
      try {
        afterCall.apply(this, args);
      } catch (error) {
        console.warn(`[TN hotkeys overlay] ${methodName} tap failed`, error);
      }
      return result;
    };
    owner[methodName]._tnHotkeysOverlayWrapped = true;
    return true;
  }

  function installTradeOverlayRuntimeTap() {
    if (tradeOverlayRuntimeTapInstalled) return;

    let installed = false;
    installed =
      wrapTradeOverlayRuntimeMethod(page.TradeTicket, "_accountPositionsRecieved", (positions) => {
        if (cacheTradeOverlayPositions(positions)) renderTradeOverlay();
      }) || installed;

    installed =
      wrapTradeOverlayRuntimeMethod(page.ConnectionProxy, "_onAccountDetails", (details) => {
        if (details && cacheTradeOverlayPositions(details.Positions)) renderTradeOverlay();
      }) || installed;

    const proxy = page.ConnectionProxy;
    if (proxy) {
      if (!Array.isArray(proxy.accountPositionListeners)) proxy.accountPositionListeners = [];
      const alreadyListening = proxy.accountPositionListeners.some(
        (listener) => listener && listener._tnHotkeysOverlayListener,
      );
      if (!alreadyListening) {
        proxy.accountPositionListeners.push({
          _tnHotkeysOverlayListener: true,
          boundFunc: (positions) => {
            if (cacheTradeOverlayPositions(positions)) renderTradeOverlay();
          },
        });
        installed = true;
      }
    }

    tradeOverlayRuntimeTapInstalled = installed;
    if (installed) debugTradeOverlay("runtime-tap-installed");
  }

  function renderTradeOverlay() {
    if (!CONFIG.SHOW_TRADE_OVERLAY) {
      debugTradeOverlay("disabled");
      removeTradeOverlay();
      return;
    }

    if (tradeOverlayDisabledByExtension) {
      debugTradeOverlay("extension-disabled-at-startup");
      removeTradeOverlay();
      return;
    }

    const viewport = getChartViewport();
    const snapshot = getTradeOverlayPositionSnapshot();
    const positions = snapshot.positions;
    if (!viewport) {
      debugTradeOverlay("no-chart-viewport", {
        hasStxx: Boolean(getChartEngine()),
        hasPixelFromPrice: Boolean(getChartEngine() && typeof getChartEngine().pixelFromPrice === "function"),
        hasChartContainer: Boolean(document.querySelector(".chartContainer")),
      });
      removeTradeOverlay();
      return;
    }

    if (!positions.length) {
      debugTradeOverlay("no-matching-positions", {
        fid: snapshot.fid,
        currentMarketOnly: CONFIG.TRADE_OVERLAY_CURRENT_MARKET_ONLY,
        fallbackToAllPositions: CONFIG.TRADE_OVERLAY_FALLBACK_TO_ALL_POSITIONS,
      });
      removeTradeOverlay();
      return;
    }

    installTradeOverlayDrawHook();
    const items = buildTradeOverlayItems(positions, viewport);

    if (!items.length) {
      debugTradeOverlay("no-visible-items", {
        positions: positions.length,
        chartHeight: viewport.rect.height,
      });
      removeTradeOverlay();
      return;
    }

    const activeKeys = new Set(items.map((item) => item.key));
    for (const [key, element] of tradeOverlayLines.entries()) {
      if (activeKeys.has(key)) continue;
      element.remove();
      tradeOverlayLines.delete(key);
    }

    for (const item of items) {
      updateTradeOverlayLine(item, viewport);
    }

    setTradeOverlayStatus(`TN overlay: rendered ${items.length} lines`, false);

    debugTradeOverlay("rendered", {
      positions: positions.length,
      lines: items.length,
      usedFallback: snapshot.usedFallback,
      chartWidth: Math.round(viewport.rect.width),
      chartHeight: Math.round(viewport.rect.height),
    });
  }

  function refreshTradeOverlayAccountState() {
    if (tradeOverlayDisabledByExtension) return;

    installTradeOverlayRuntimeTap();
    refreshTradeTicketState();
    sendAccountOptions();
    renderTradeOverlay();
  }

  function startTradeOverlay() {
    if (tradeOverlayTimer) return;

    runTradeOverlayStartupCheck();
    if (tradeOverlayDisabledByExtension) {
      removeTradeOverlay();
      return;
    }

    installTradeOverlayDrawHook();
    installTradeOverlayRuntimeTap();
    tradeOverlayTimer = setInterval(renderTradeOverlay, CONFIG.TRADE_OVERLAY_REFRESH_MS);
    if (!tradeOverlayAccountRefreshTimer) {
      tradeOverlayAccountRefreshTimer = setInterval(
        refreshTradeOverlayAccountState,
        CONFIG.TRADE_OVERLAY_ACCOUNT_REFRESH_MS,
      );
    }
    window.addEventListener("resize", renderTradeOverlay, { passive: true });
    window.addEventListener("scroll", renderTradeOverlay, { passive: true });
    refreshTradeOverlayAccountState();
    renderTradeOverlay();
  }

  function tradeOverlayDiagnostics() {
    const snapshot = getTradeOverlayPositionSnapshot();
    const records = snapshot.records;
    const chart = getChartEngine();
    const panel = getChartPanel(chart);
    const viewport = getChartViewport();
    const positions = snapshot.positions;
    const items = viewport ? buildTradeOverlayItems(positions, viewport) : [];
    const firstPosition = positions[0];
    const firstEntryPrice = firstPosition ? getPositionEntryPrice(firstPosition) : null;
    const summary = {
      showTradeOverlay: CONFIG.SHOW_TRADE_OVERLAY,
      broadExtensionDetected: isTradeFromChartExtensionPresent(),
      extensionOverlayDetected: isTradeFromChartOverlayPresent(),
      disabledByExtensionAtStartup: tradeOverlayDisabledByExtension,
      startupCheckDone: tradeOverlayStartupCheckDone,
      fid: snapshot.fid,
      hasStxx: Boolean(getChartEngine()),
      hasStxxGlobal: Boolean(page.stxx),
      hasCapturedEngine: Boolean(chartEngineInstance),
      hasPixelFromPrice: Boolean(getChartEngine() && typeof getChartEngine().pixelFromPrice === "function"),
      hasChartContainer: Boolean(document.querySelector(".chartContainer")),
      panelKeys: chart && chart.panels ? Object.keys(chart.panels) : null,
      hasPanel: Boolean(panel),
      viewportPresent: Boolean(viewport),
      viewportRect: viewport
        ? { width: Math.round(viewport.rect.width), height: Math.round(viewport.rect.height) }
        : null,
      firstEntryPrice,
      firstEntryPixel:
        chart && panel && typeof chart.pixelFromPrice === "function" && firstEntryPrice != null
          ? chart.pixelFromPrice(Number(firstEntryPrice), panel)
          : null,
      drawHookInstalled: tradeOverlayDrawHookInstalled,
      runtimeTapInstalled: tradeOverlayRuntimeTapInstalled,
      cachedPositionRecords: Array.isArray(tradeOverlayPositionRecordsCache)
        ? tradeOverlayPositionRecordsCache.length
        : 0,
      totalPositionRecords: Array.isArray(records) ? records.length : 0,
      matchingPositions: positions.length,
      usedFallback: snapshot.usedFallback,
      generatedLines: items.length,
      overlayElementPresent: Boolean(document.querySelector(".tn-hotkeys-chart-line")),
      renderedDomLines: document.querySelectorAll(".tn-hotkeys-chart-line").length,
      firstGeneratedLine: items[0]
        ? {
            key: items[0].key,
            rawTop: items[0].rawTop,
            label: items[0].label,
          }
        : null,
    };

    console.log("[TN hotkeys overlay diagnostics]", summary);
    if (Array.isArray(records)) {
      console.table(
        records.map((position) => ({
          PositionID: position.PositionID,
          Type: position.Type,
          MarketID: position.MarketID,
          Direction: position.Direction,
          OpeningPrice: position.OpeningPrice,
          StopOrderPrice: position.StopOrderPrice,
          LimitOrderPrice: position.LimitOrderPrice,
        })),
      );
    }

    return summary;
  }

  page.TNHotkeysTradeOverlayDebug = tradeOverlayDiagnostics;

  function sendAccountOptions() {
    const proxy = page.ConnectionProxy;
    if (!proxy) return false;

    try {
      if (proxy.connection && typeof proxy.connection.sendOptions === "function") {
        proxy.connection.sendOptions({
          data: "{\"SubscribeToAccountSummary\":true,\"SubscribeToAccountDetails\":true}",
          action: "options",
        });
      }

      if (typeof proxy._sendOptions === "function") {
        proxy._sendOptions();
      }

      return true;
    } catch (error) {
      console.warn("[TN hotkeys] Account/options refresh failed", error);
      return false;
    }
  }

  function refreshTradeTicketState() {
    const ticket = page.TradeTicket;
    if (!ticket) return false;

    let refreshed = false;
    for (const methodName of ["getOpeningOrders", "getCurrentPositions"]) {
      if (typeof ticket[methodName] !== "function") continue;

      try {
        ticket[methodName]();
        refreshed = true;
      } catch (error) {
        console.warn(`[TN hotkeys] TradeTicket.${methodName} failed`, error);
      }
    }

    return refreshed;
  }

  function refreshRuntimeState(force = false) {
    const now = Date.now();
    if (!force && now - lastStateRefreshAt < 750) return false;
    lastStateRefreshAt = now;

    const optionsSent = sendAccountOptions();
    const ticketRefreshed = refreshTradeTicketState();
    return optionsSent || ticketRefreshed;
  }

  function syncPositionsSoon() {
    setTimeout(() => refreshRuntimeState(true), 250);
    setTimeout(() => refreshRuntimeState(true), 750);
    setTimeout(() => renderTradeOverlay(), 300);
    setTimeout(() => renderTradeOverlay(), 900);
  }

  function hasLiveBidAsk(quote) {
    return quote && quote.Ask != null && quote.Bid != null;
  }

  function quoteMatchesQid(quote, qid) {
    if (!quote || qid == null) return true;

    const quoteId =
      quote.QuoteID != null
        ? quote.QuoteID
        : quote.QuoteId != null
          ? quote.QuoteId
          : quote.MarketQuoteID != null
            ? quote.MarketQuoteID
            : null;

    return quoteId == null || String(quoteId) === String(qid);
  }

  function getFeedQuote(qid) {
    return (
      page.PriceFeedMultiplexer &&
      page.PriceFeedMultiplexer._quotes &&
      page.PriceFeedMultiplexer._quotes[`${qid}-Candle1Min`]
    );
  }

  function getQuote(qid) {
    const feedQuote = getFeedQuote(qid);
    if (hasLiveBidAsk(feedQuote)) return feedQuote;

    const tradeTicketQuote = page.TradeTicket && page.TradeTicket._quote;
    if (hasLiveBidAsk(tradeTicketQuote) && quoteMatchesQid(tradeTicketQuote, qid)) {
      return tradeTicketQuote;
    }

    throw new Error(`No live Ask/Bid quote is available yet for QID ${qid || "current market"}.`);
  }

  async function waitForQuote(qid) {
    const startedAt = Date.now();
    let lastError = null;

    while (Date.now() - startedAt <= CONFIG.RUNTIME_WAIT_MS) {
      try {
        return getQuote(qid);
      } catch (error) {
        lastError = error;
        refreshRuntimeState(true);
        await delay(150);
      }
    }

    throw lastError || new Error("No live Ask/Bid quote is available yet.");
  }

  function getPositions(currentMarketOnly = true) {
    const records = getAccountPositionRecords();

    if (!Array.isArray(records)) {
      throw new Error("No open positions are available yet.");
    }

    const fid = getQueryParam("FID");
    const positions = records.filter((position) => {
      if (String(position.Type) !== "1") return false;
      if (!currentMarketOnly) return true;
      return String(position.MarketID) === String(fid);
    });

    if (!positions.length) {
      throw new Error(
        currentMarketOnly
          ? "No open single positions for the current chart market."
          : "No open single positions.",
      );
    }

    return positions;
  }

  async function waitForPositions(currentMarketOnly = true) {
    const startedAt = Date.now();
    let lastError = null;

    while (Date.now() - startedAt <= CONFIG.RUNTIME_WAIT_MS) {
      try {
        return getPositions(currentMarketOnly);
      } catch (error) {
        lastError = error;
        refreshRuntimeState(true);
        await delay(200);
      }
    }

    throw lastError || new Error("No open positions are available yet.");
  }

  function getBrowserDetails() {
    if (page.TradeTicket && typeof page.TradeTicket.browserDetails === "function") {
      return page.TradeTicket.browserDetails();
    }
    return navigator.userAgent;
  }

  function normalizeAtQuoteAtMarket(value) {
    if (typeof page._checkAndReturnAtQuoteAtMarket === "function") {
      return page._checkAndReturnAtQuoteAtMarket(value);
    }
    if (value === 1) return 2;
    if (value === 2) return 1;
    return 0;
  }

  async function getMarketDetails(fid) {
    const existing = page.marketdetails && page.marketdetails.marketDetails;
    if (existing) return page.marketdetails;

    const { wsuts } = await waitForTradingObjects({ requireRequestTrade: false });
    if (typeof wsuts.GetMarketDetails !== "function") {
      return Promise.reject(new Error("Market details are not available yet."));
    }

    return new Promise((resolve, reject) => {
      wsuts.GetMarketDetails(
        parseInt(fid, 10),
        (details) => {
          page.marketdetails = details;
          resolve(details);
        },
        reject,
      );
    });
  }

  function roundPrice(value, decimals) {
    return Number(Number(value).toFixed(decimals));
  }

  function decimalPlacesFromPrice(value) {
    const [, decimals = ""] = String(value).split(".");
    return decimals.length;
  }

  function newestPosition(positions) {
    const timed = positions
      .map((position) => ({
        position,
        time: Date.parse(String(position.CreationTime || position.CreatedDate || position.OpenTime || "")),
      }))
      .filter((item) => Number.isFinite(item.time));

    if (!timed.length) return null;
    timed.sort((a, b) => b.time - a.time);
    return timed[0].position;
  }

  function positionScreenY(position) {
    const chart = getChartEngine();
    const chartContainer = getChartContainer(chart);
    const panel = getChartPanel(chart);

    if (!chart || typeof chart.pixelFromPrice !== "function" || !chartContainer) {
      return null;
    }

    const y = chart.pixelFromPrice(Number(position.OpeningPrice), panel);
    if (!Number.isFinite(y)) return null;
    return chartContainer.getBoundingClientRect().top + getDrawingSettingsOffset() + y;
  }

  function closestPositionToMouse(positions) {
    let best = null;
    let bestDistance = Infinity;

    for (const position of positions) {
      const y = positionScreenY(position);
      if (y == null) continue;
      const distance = Math.abs(y - lastMouse.y);
      if (distance < bestDistance) {
        best = position;
        bestDistance = distance;
      }
    }

    return best;
  }

  function selectPositionFrom(positions) {
    const remembered = positions.find(
      (position) => String(position.PositionID) === String(lastOpenedPositionId),
    );
    if (remembered) return remembered;

    return newestPosition(positions) || closestPositionToMouse(positions) || positions[0];
  }

  function selectedPosition() {
    return selectPositionFrom(getPositions(true));
  }

  async function resolveSelectedPosition(position, actionName) {
    if (position) return position;

    const positions = await waitForPositions(true);
    const selected = selectPositionFrom(positions);
    if (!selected) throw new Error(`No position selected for ${actionName}.`);
    return selected;
  }

  function maybeRememberNewestPosition() {
    setTimeout(() => {
      try {
        const position = newestPosition(getPositions(true));
        if (position) lastOpenedPositionId = position.PositionID;
      } catch {
        // The account feed can lag the order fill. The next BE/close action
        // will fall back to newest/nearest position selection.
      }
    }, 1500);
  }

  function closeOrderMode(position, stopPrice, limitPrice) {
    const hasStop = stopPrice !== "-" && Number(stopPrice) !== 0;
    const hasLimit = limitPrice !== "-" && Number(limitPrice) !== 0;
    if (hasStop && hasLimit) return 3;
    if (hasStop) return 2;
    if (hasLimit) return 1;
    return position.LimitOrderPrice !== "-" ? 1 : 2;
  }

  function closeProtectionPayload(position, stopPrice, limitPrice) {
    return {
      marketID: position.MarketID,
      quoteID: position.QuoteID,
      tradeMode: position.Direction === "Buy",
      orderStake: String(position.Stake),
      isGuaranteed: false,
      orderModeID: closeOrderMode(position, stopPrice, limitPrice),
      orderTypeID: 2,
      orderPriceModeID: 2,
      limitOrderPrice: limitPrice === "-" ? 0 : String(limitPrice),
      stopOrderPrice: stopPrice === "-" ? 0 : String(stopPrice),
      trailingPoint: 0,
      closePositionID: position.PositionID,
    };
  }

  async function insertCloseOrder(position, stopPrice, limitPrice) {
    const { wsuts } = await waitForTradingObjects({ requireRequestTrade: false });
    const payload = closeProtectionPayload(position, stopPrice, limitPrice);

    return new Promise((resolve, reject) => {
      wsuts.InsertCloseOrder(
        payload.marketID,
        payload.quoteID,
        payload.tradeMode,
        payload.orderStake,
        payload.isGuaranteed,
        payload.orderModeID,
        payload.orderTypeID,
        payload.orderPriceModeID,
        payload.limitOrderPrice,
        payload.stopOrderPrice,
        payload.trailingPoint,
        payload.closePositionID,
        resolve,
        reject,
      );
    });
  }

  async function amendCloseOrder(position, stopPrice, limitPrice) {
    const { wsuts } = await waitForTradingObjects({ requireRequestTrade: false });
    const orderMode = closeOrderMode(position, stopPrice, limitPrice);

    return new Promise((resolve, reject) => {
      wsuts.AmendCloseOrder(
        position.MarketName,
        position.OrderID,
        position.Stake,
        orderMode,
        2,
        2,
        limitPrice === "-" ? 0 : limitPrice,
        stopPrice === "-" ? 0 : stopPrice,
        0,
        false,
        resolve,
        reject,
      );
    });
  }

  async function movePositionToBreakEven(position) {
    assertDemoAllowed();
    position = await resolveSelectedPosition(position, "break-even");
    if (!position) throw new Error("No position selected for break-even.");

    const fid = getQueryParam("FID") || position.MarketID;
    const details = await getMarketDetails(fid);
    const md = details.marketDetails || {};
    const betPer = Number(md.BetPer || md.DisplayBetPer || 1);
    const decimals = parseInt(
      md.PrcGenDecimalPlaces || decimalPlacesFromPrice(position.OpeningPrice) || 2,
      10,
    );
    const entryPrice = Number(position.OpeningPrice);
    const offset = CONFIG.BREAKEVEN_OFFSET_POINTS * betPer;
    const stopPrice = roundPrice(
      position.Direction === "Buy" ? entryPrice + offset : entryPrice - offset,
      decimals,
    );

    if (Number(position.StopOrderPrice) === stopPrice) {
      notify(
        `Position ${position.PositionID} is already at BE offset ${CONFIG.BREAKEVEN_OFFSET_POINTS}`,
      );
      return;
    }

    const limitPrice = position.LimitOrderPrice === "-" ? 0 : position.LimitOrderPrice;

    notify(`BE position ${position.PositionID} -> ${stopPrice}`);
    if (position.OrderID) {
      await amendCloseOrder(position, stopPrice, limitPrice);
    } else {
      await insertCloseOrder(position, stopPrice, limitPrice);
    }

    lastOpenedPositionId = position.PositionID;
    notify(`BE done for position ${position.PositionID}`);
    syncPositionsSoon();
  }

  async function moveTakeProfitNearTouch(position) {
    assertDemoAllowed();
    position = await resolveSelectedPosition(position, "take-profit");
    if (!position) throw new Error("No position selected for take-profit.");

    const fid = getQueryParam("FID") || position.MarketID;
    const qid = getQueryParam("QID") || position.QuoteID;
    const details = await getMarketDetails(fid);
    const md = details.marketDetails || {};
    const quote = await waitForQuote(qid);
    const betPer = Number(md.BetPer || md.DisplayBetPer || 1);
    const decimals = parseInt(
      md.PrcGenDecimalPlaces || decimalPlacesFromPrice(position.OpeningPrice) || 2,
      10,
    );
    const isBuy = position.Direction === "Buy";
    const closeTouchPrice = Number(isBuy ? quote.Bid : quote.Ask);
    const offset = CONFIG.TAKE_PROFIT_TOUCH_OFFSET_POINTS * betPer;
    const limitPrice = roundPrice(
      isBuy ? closeTouchPrice + offset : closeTouchPrice - offset,
      decimals,
    );

    if (Number(position.LimitOrderPrice) === limitPrice) {
      notify(
        `Position ${position.PositionID} already has TP touch offset ${CONFIG.TAKE_PROFIT_TOUCH_OFFSET_POINTS}`,
      );
      return;
    }

    const stopPrice = position.StopOrderPrice === "-" ? 0 : position.StopOrderPrice;

    notify(`TP position ${position.PositionID} -> ${limitPrice}`);
    if (position.OrderID) {
      await amendCloseOrder(position, stopPrice, limitPrice);
    } else {
      await insertCloseOrder(position, stopPrice, limitPrice);
    }

    lastOpenedPositionId = position.PositionID;
    notify(`TP done for position ${position.PositionID}`);
    syncPositionsSoon();
  }

  async function getOpenPositionDetails(positionId) {
    const { wsuts } = await waitForTradingObjects({ requireRequestTrade: false });

    if (typeof wsuts.GetOpenPositionDetails !== "function") {
      return null;
    }

    return new Promise((resolve) => {
      wsuts.GetOpenPositionDetails(positionId, resolve, () => resolve(null));
    });
  }

  async function closePosition(position) {
    assertDemoAllowed();
    position = await resolveSelectedPosition(position, "close");
    if (!position) throw new Error("No position selected to close.");

    const { wsuts } = await waitForTradingObjects({ requireRequestTrade: false });
    const qid = getQueryParam("QID");
    const fid = getQueryParam("FID");
    const quote = await waitForQuote(qid);
    const details = await getOpenPositionDetails(position.PositionID);
    const initStake =
      details && details.openPosition && details.openPosition.InitStake != null
        ? details.openPosition.InitStake
        : position.Stake;
    const price = position.Direction === "Buy" ? quote.Bid : quote.Ask;
    const encryptedMessage =
      quote.EncryptedMessage ||
      (page.TradeTicket && page.TradeTicket._quote && page.TradeTicket._quote.EncryptedMessage);
    const methodName = String(getQueryParam("TID")) === "1" ? "InsertClosePositionCFD" : "InsertClosePosition";
    const closeMethod = wsuts[methodName];

    if (!encryptedMessage) {
      throw new Error("Quote EncryptedMessage is missing.");
    }

    if (typeof closeMethod !== "function") {
      throw new Error(`${methodName} is not available.`);
    }

    notify(`Close position ${position.PositionID}`);

    await new Promise((resolve, reject) => {
      const args = [
        fid,
        position.PositionID,
        qid,
        price,
        Math.min(Number(initStake), Number(position.Stake)),
        position.Direction === "Buy",
        true,
        getBrowserDetails(),
        encryptedMessage,
      ];

      if (methodName === "InsertClosePositionCFD") {
        args.push((page.market_data && page.market_data.currency) || getQueryParam("CUR") || "");
      }

      args.push(resolve, reject, () => {});
      closeMethod.apply(wsuts, args);
    });

    if (String(lastOpenedPositionId) === String(position.PositionID)) {
      lastOpenedPositionId = null;
    }

    notify(`Close sent for position ${position.PositionID}`);
    syncPositionsSoon();
  }

  async function closeAllPositions() {
    assertDemoAllowed();
    const positions = await waitForPositions(CONFIG.CLOSE_ALL_CURRENT_MARKET_ONLY);
    notify(`Close All: ${positions.length} position(s)`);

    for (const position of positions) {
      await closePosition(position);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    notify("Close All finished");
  }

  async function placeMarketTrade(direction) {
    assertDemoAllowed();

    const now = Date.now();
    if (now - lastTradeAt < CONFIG.COOLDOWN_MS) return;
    lastTradeAt = now;

    const fid = getQueryParam("FID");
    const qid = getQueryParam("QID");
    if (!fid || !qid) throw new Error("FID/QID query params are missing.");

    const { instance, requestTrade } = await waitForTradingObjects();
    const details = await getMarketDetails(fid);
    const md = details.marketDetails || {};
    const quote = await waitForQuote(qid);

    if (quote.Tradable === false) {
      throw new Error("Market is not tradable right now.");
    }

    const isSell = direction === "sell";
    const entryPrice = Number(isSell ? quote.Bid : quote.Ask);
    const betPer = Number(md.BetPer || md.DisplayBetPer || 1);
    const decimals = parseInt(md.PrcGenDecimalPlaces || 2, 10);
    const stopOffset = CONFIG.STOP_DISTANCE_POINTS * betPer;
    const limitOffset = CONFIG.LIMIT_DISTANCE_POINTS * betPer;

    const stopOrderPrice = roundPrice(
      isSell ? entryPrice + stopOffset : entryPrice - stopOffset,
      decimals,
    );
    const limitOrderPrice =
      CONFIG.LIMIT_DISTANCE_POINTS > 0
        ? roundPrice(isSell ? entryPrice - limitOffset : entryPrice + limitOffset, decimals)
        : 0;

    const hasStop = CONFIG.STOP_DISTANCE_POINTS > 0;
    const hasLimit = CONFIG.LIMIT_DISTANCE_POINTS > 0;
    const hasIfDoneOrder = hasStop || hasLimit;
    const idoOrderModeId = hasStop && hasLimit ? 3 : hasStop ? 2 : hasLimit ? 1 : 0;
    const atQuoteAtMarket = hasIfDoneOrder
      ? normalizeAtQuoteAtMarket(md.AtQuoteAtMarket)
      : 0;

    const encryptedMessage =
      quote.EncryptedMessage ||
      (page.TradeTicket && page.TradeTicket._quote && page.TradeTicket._quote.EncryptedMessage);

    if (!encryptedMessage) {
      throw new Error("Quote EncryptedMessage is missing.");
    }

    notify(
      `${direction.toUpperCase()} ${CONFIG.STAKE}, SL ${CONFIG.STOP_DISTANCE_POINTS} @ ${stopOrderPrice}`,
    );

    requestTrade.call(
      instance,
      fid,
      qid,
      entryPrice,
      CONFIG.STAKE,
      1,
      isSell,
      hasIfDoneOrder,
      false,
      idoOrderModeId,
      2,
      atQuoteAtMarket,
      limitOrderPrice,
      hasStop ? stopOrderPrice : 0,
      0,
      0,
      true,
      getBrowserDetails(),
      encryptedMessage,
      (response) => {
        if (response && response.Status === 0) {
          notify(`${direction.toUpperCase()} filled at ${response.Price}`);
          maybeRememberNewestPosition();
          syncPositionsSoon();
        } else {
          notify(
            `${direction.toUpperCase()} failed: ${
              response && response.Message ? response.Message : "unknown error"
            }`,
            true,
          );
        }
      },
      () => notify(`${direction.toUpperCase()} request failed`, true),
    );
  }

  function hasCurrentQuote() {
    try {
      getQuote(getQueryParam("QID"));
      return true;
    } catch {
      return false;
    }
  }

  function hasAccountPositionsSnapshot() {
    return Array.isArray(getAccountPositionRecords());
  }

  function startRuntimeBootstrap() {
    if (bootstrapTimer) return;
    runTradeOverlayStartupCheck();

    const startedAt = Date.now();
    const pollRuntime = () => {
      if (!tradeOverlayDisabledByExtension) {
        refreshRuntimeState();
      }

      const isReady = hasCurrentQuote() && hasAccountPositionsSnapshot();
      const hasWaitedLongEnough = Date.now() - startedAt > CONFIG.RUNTIME_WAIT_MS * 3;
      if (isReady || hasWaitedLongEnough) {
        clearInterval(bootstrapTimer);
        bootstrapTimer = null;
      }
    };

    bootstrapTimer = setInterval(pollRuntime, CONFIG.BOOTSTRAP_POLL_MS);
    pollRuntime();

    if (!maintenanceTimer) {
      maintenanceTimer = setInterval(() => {
        if (!tradeOverlayDisabledByExtension) {
          refreshRuntimeState();
        }
      }, CONFIG.MAINTENANCE_REFRESH_MS);
    }
  }

  document.addEventListener(
    "mousemove",
    (event) => {
      lastMouse.x = event.clientX;
      lastMouse.y = event.clientY;
    },
    true,
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.repeat || isTypingTarget(event.target)) return;

      let action = null;
      if (matchesHotkey(event, CONFIG.BUY_HOTKEY)) action = () => placeMarketTrade("buy");
      if (matchesHotkey(event, CONFIG.SELL_HOTKEY)) action = () => placeMarketTrade("sell");
      if (matchesHotkey(event, CONFIG.BREAKEVEN_HOTKEY)) action = () => movePositionToBreakEven();
      if (matchesHotkey(event, CONFIG.TAKE_PROFIT_HOTKEY)) action = () => moveTakeProfitNearTouch();
      if (matchesHotkey(event, CONFIG.CLOSE_HOTKEY)) action = () => closePosition();
      if (matchesHotkey(event, CONFIG.CLOSE_ALL_HOTKEY)) action = () => closeAllPositions();
      if (!action) return;

      event.preventDefault();
      event.stopPropagation();

      action().catch((error) => {
        notify(error.message || String(error), true);
      });
    },
    true,
  );

  startRuntimeBootstrap();
  startTradeOverlay();
  notify(
    tradeOverlayDisabledByExtension
      ? "TFC extension detected: userscript overlay off. Hotkeys remain: Buy/Sell/BE/TP/Close/Close All."
      : "TN hotkeys loaded: Buy B, Sell S, BE E, TP T, Close X, Close All A, overlay on",
  );
})();
