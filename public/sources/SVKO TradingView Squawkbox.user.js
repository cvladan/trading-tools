// ==UserScript==
// @name         SVKO TradingView Squawkbox
// @namespace    cvladan.com
// @version      0.1.1
// @description  Hear price movements from one explicitly selected TradingView chart.
// @author       cvladan
// @icon         https://static.tradingview.com/static/images/favicon.ico
// @match        https://www.tradingview.com/chart/*
// @noframes
// @run-at       document-idle
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @license      LicenseRef-SVKO-Personal-Use-Commercial-1.0; https://trading.cvladan.com/licences/SVKO-1.0.txt
// ==/UserScript==
// Copyright (c) 2026 Vladan Colovic (SVKO).
// SVKO Personal Use and Commercial Licence 1.0.
// Free personal use includes trading real money for your own profit.
// Company, employment and other business use requires a separate paid licence.
// Terms: https://trading.cvladan.com/licences/SVKO-1.0.txt
// Third-party material retains its own licence.

(() => {
  'use strict';
  if (window.self !== window.top || location.protocol !== 'https:' ||
      location.hostname !== 'www.tradingview.com' || !location.pathname.startsWith('/chart/')) return;

  /*
   * Bundled tiks toggle generators and dependencies.
   * Source: https://github.com/rexa-developer/tiks/tree/806cab3e06143d44545b6e8c49dfd94391277100
   * MIT License
   *
   * Copyright (c) 2026 Rexa
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   */
  var TiksSounds = (() => {
    var __defProp = Object.defineProperty;
    var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames = Object.getOwnPropertyNames;
    var __hasOwnProp = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames(from))
          if (!__hasOwnProp.call(to, key) && key !== except)
            __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

    // ../../../../private/tmp/svko-squawkbox-build/tiks/entry.ts
    var entry_exports = {};
    __export(entry_exports, {
      SOFT_THEME: () => SOFT_THEME,
      toggleOff: () => toggleOff,
      toggleOn: () => toggleOn
    });

    // ../../../../private/tmp/svko-squawkbox-build/tiks/src/noise.ts
    var whiteBuffer = null;
    var pinkBuffer = null;
    var cachedCtx = null;
    function ensureFreshCache(ctx) {
      if (cachedCtx !== ctx) {
        whiteBuffer = null;
        pinkBuffer = null;
        cachedCtx = ctx;
      }
    }
    function getWhiteNoise(ctx) {
      ensureFreshCache(ctx);
      if (whiteBuffer) return whiteBuffer;
      const length = Math.floor(ctx.sampleRate * 0.5);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      whiteBuffer = buffer;
      return buffer;
    }
    function getPinkNoise(ctx) {
      ensureFreshCache(ctx);
      if (pinkBuffer) return pinkBuffer;
      const length = Math.floor(ctx.sampleRate * 0.5);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
      pinkBuffer = buffer;
      return buffer;
    }

    // ../../../../private/tmp/svko-squawkbox-build/tiks/src/generators/_util.ts
    var SCHEDULE_OFFSET = 5e-3;
    function startTime(ctx) {
      return ctx.currentTime + SCHEDULE_OFFSET;
    }
    function createNoiseSource(ctx, theme) {
      const source = ctx.createBufferSource();
      source.buffer = theme.noiseColor === "pink" ? getPinkNoise(ctx) : getWhiteNoise(ctx);
      source.loop = true;
      return source;
    }

    // ../../../../private/tmp/svko-squawkbox-build/tiks/src/generators/toggle.ts
    var makeToggle = (startRatio, endRatio) => (ctx, dest, theme) => {
      const now = startTime(ctx);
      const duration = Math.max(0.06 * theme.decay, 5e-3);
      const osc = ctx.createOscillator();
      osc.type = theme.oscType;
      osc.frequency.setValueAtTime(theme.baseFreq * startRatio, now);
      osc.frequency.exponentialRampToValueAtTime(theme.baseFreq * endRatio, now + duration);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(1e-3, now);
      gain.gain.linearRampToValueAtTime(0.75, now + theme.attack);
      gain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + duration);
      const noiseDuration = Math.max(0.01 * theme.decay, 5e-3);
      const noise = createNoiseSource(ctx, theme);
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.24, now);
      nGain.gain.exponentialRampToValueAtTime(1e-3, now + noiseDuration);
      noise.connect(nGain);
      nGain.connect(dest);
      noise.start(now);
      noise.stop(now + noiseDuration);
    };
    var toggleOn = makeToggle(0.8, 1.2);
    var toggleOff = makeToggle(1, 0.6);

    // ../../../../private/tmp/svko-squawkbox-build/tiks/src/themes.ts
    var SOFT_THEME = {
      name: "soft",
      baseFreq: 440,
      noiseColor: "pink",
      oscType: "sine",
      filterFreq: 3e3,
      filterQ: 2,
      attack: 2e-3,
      decay: 1,
      brightness: 2e3
    };
    return __toCommonJS(entry_exports);
  })();

  const SETTINGS_KEY = 'svko-squawkbox:settings:v1';
  const MIN_SOUND_MS = 120;
  const saved = GM_getValue(SETTINGS_KEY, {});
  const settings = {
    volume: Number.isFinite(saved?.volume) ? Math.max(0, Math.min(0.5, saved.volume)) : 0.15,
    ticks: Number.isInteger(saved?.ticks) && saved.ticks >= 1 && saved.ticks <= 10000 ? saved.ticks : 5,
  };
  let panel, ui, audio, master, listening;

  function message(text) {
    if (ui) { ui.status.textContent = text; ui.indicator.title = text; }
  }

  function stop(text = 'Stopped. Select a chart, then press Start.') {
    const old = listening;
    listening = null;
    if (old) {
      for (const [event, callback] of old.subscriptions) event.unsubscribe(old, callback);
    }
    const previousAudio = audio;
    audio = master = null;
    if (previousAudio) {
      previousAudio.onstatechange = null;
      if (previousAudio.state !== 'closed') previousAudio.close().catch(() => {});
    }
    if (ui) {
      ui.start.disabled = false; ui.stop.disabled = true;
      ui.indicator.dataset.direction = ''; ui.indicator.textContent = '●';
    }
    message(text);
  }

  async function enableAudio() {
    if (!audio || audio.state === 'closed') {
      audio = new AudioContext();
      master = audio.createGain();
      master.gain.value = settings.volume;
      master.connect(audio.destination);
      const context = audio;
      context.onstatechange = () => {
        if (audio === context && listening?.ready && context.state !== 'running') {
          stop('Audio paused by the browser. Press Start to resume.');
        }
      };
    }
    const context = audio;
    if (context.state !== 'running') await context.resume();
    if (context !== audio) return false;
    if (context.state !== 'running') throw new Error('Audio is blocked. Click Start or Test again.');
    ui.stop.disabled = false;
    return true;
  }

  function play(direction, strength = 1) {
    if (audio?.state !== 'running' || !master) return false;
    const shift = Math.min(6, Math.max(0, Math.log2(Math.max(1, strength)) * 2));
    const baseFreq = direction > 0 ? 620 * 2 ** (shift / 12) : 330 / 2 ** (shift / 12);
    const theme = { ...TiksSounds.SOFT_THEME, baseFreq, decay: 0.65 };
    (direction > 0 ? TiksSounds.toggleOn : TiksSounds.toggleOff)(audio, master, theme);
    ui.indicator.dataset.direction = direction > 0 ? 'up' : 'down';
    ui.indicator.textContent = direction > 0 ? '▲' : '▼';
    return true;
  }

  function readQuote(state) {
    const quote = state.provider.quotes().value();
    if (!quote || typeof quote.last_price !== 'number' || !Number.isFinite(quote.last_price)) return null;
    // The full provider identity prevents a stale quote from a previous symbol becoming a baseline.
    if (quote.pro_name !== state.symbol && quote.original_name !== state.symbol) return null;
    if (typeof quote.lp_time === 'number' && quote.lp_time < state.quoteTime) return null;
    return quote;
  }

  function handleQuote(state) {
    if (listening !== state || !state.ready) return;
    try {
      if (state.replay.value() || state.chart.symbol() !== state.symbol || state.provider.symbol() !== state.source ||
          state.chart.chartModel().mainSeries() !== state.series) {
        stop('The locked chart or symbol changed. Select a chart and press Start.');
        return;
      }
      const quote = readQuote(state);
      if (!quote) return;
      state.quoteTime = Math.max(state.quoteTime, quote.lp_time || 0);
      const price = quote.last_price;
      if (price === state.lastPrice) return;
      state.lastPrice = price;
      ui.price.textContent = String(price);
      const ticks = Math.round(price / state.step);
      if (state.anchor === null) { state.anchor = ticks; return; }
      const movement = ticks - state.anchor;
      const now = performance.now();
      if (Math.abs(movement) < settings.ticks || now - state.lastSound < MIN_SOUND_MS) return;
      if (!play(Math.sign(movement), Math.abs(movement) / settings.ticks)) {
        stop('Audio is not running. Press Start to resume.');
        return;
      }
      state.anchor = ticks;
      state.lastSound = now;
      state.sounds++;
      message(`Listening · ${movement > 0 ? 'Up' : 'Down'} ${Math.abs(movement)} ticks · ${state.sounds} sounds`);
    } catch (error) {
      stop(`Stopped: ${error.message}`);
    }
  }

  async function start() {
    stop();
    let state;
    try {
      const api = unsafeWindow.TradingViewApi;
      const chart = api?._activeChartWidgetWV?.value?.();
      if (!chart) throw new Error('TradingView is not ready. Try Start after the chart loads.');
      const replay = chart.getSeries().isInReplay();
      if (replay.value()) throw new Error('Exit Bar Replay before starting Squawkbox.');
      const series = chart.chartModel().mainSeries();
      const provider = series.quotesProvider();
      const step = series.priceStep();
      if (!Number.isFinite(step) || step <= 0) throw new Error('This chart has no usable price step.');
      state = { chart, series, provider, replay, step, symbol: chart.symbol(), id: chart.id(), source: provider.symbol(),
        anchor: null, lastPrice: null, quoteTime: 0, lastSound: -Infinity, sounds: 0, subscriptions: [], ready: false };
      if (!readQuote(state)) throw new Error('A matching live quote is not available for this chart.');
      listening = state;
      ui.start.disabled = true;
      ui.stop.disabled = false;
      ui.symbol.textContent = `${state.symbol} · chart ${state.id}`;
      if (ui.minimize.getAttribute('aria-expanded') === 'false') ui.heading.textContent = state.symbol;
      ui.step.textContent = `1 tick = ${step} points`;
      message('Enabling audio…');
      if (!await enableAudio() || listening !== state) return;
      if (chart.symbol() !== state.symbol || provider.symbol() !== state.source) {
        stop('The symbol changed during Start. Select a chart and try again.');
        return;
      }
      const baseline = readQuote(state);
      if (!baseline) throw new Error('The matching quote became unavailable. Try Start again.');
      state.anchor = Math.round(baseline.last_price / step);
      state.lastPrice = baseline.last_price;
      state.quoteTime = baseline.lp_time || 0;
      ui.price.textContent = String(baseline.last_price);
      const changed = () => { if (listening === state) stop('Chart data or symbol changed. Press Start to bind again.'); };
      state.subscriptions = [
        [provider.quotesUpdate(), () => handleQuote(state)],
        [provider.quoteSymbolChanged(), changed],
        [series.dataEvents().cleared(), changed],
      ];
      for (const [event, callback] of state.subscriptions) event.subscribe(state, callback);
      state.ready = true;
      message('Listening · waiting for a price move');
    } catch (error) {
      if (!state || listening === state) stop(`Cannot start: ${error.message}`);
    }
  }

  function saveSettings() {
    GM_setValue(SETTINGS_KEY, { ...settings });
  }

  function showPanel() {
    if (panel?.isConnected) return;
    panel = document.createElement('iframe');
    panel.id = 'svko-squawkbox';
    panel.title = 'SVKO TradingView Squawkbox';
    panel.style.cssText = 'position:fixed;left:0;top:0;width:310px;height:270px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);border:1px solid #465168;border-radius:10px;z-index:1000;color-scheme:dark;box-shadow:0 4px 18px #0008;';
    document.body.append(panel);
    // Use a separate document so TradingView hotkeys do not capture the settings inputs.
    const root = panel.contentDocument;
    root.body.innerHTML = `<style>
      :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;padding:12px;background:#131722;color:#e5e9f0;font:12px/1.4 system-ui,sans-serif}
      header{display:flex;align-items:center;gap:8px;cursor:move;touch-action:none;user-select:none}strong{font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}button{background:#252d3c;border:1px solid #475368;color:#eef2f8;border-radius:5px;padding:5px 9px;cursor:pointer}button:hover{background:#34435b}button:disabled{opacity:.45;cursor:default}#close,#minimize{border:0;padding:0 4px;background:none;font-size:18px}#start{background:#255fc4}#symbol-row{display:flex;align-items:center;gap:8px;margin-top:4px}#symbol{font-weight:600}#price{font-size:18px;font-variant-numeric:tabular-nums}#status{height:34px;color:#b6c7df;overflow-wrap:anywhere;font-size:11px;margin:3px 0}
      .row{display:flex;align-items:center;gap:6px;margin-top:7px}label{display:flex;align-items:center;gap:6px}.settings{flex-direction:column;align-items:stretch}.settings label{justify-content:space-between}input[type=range]{width:83px;accent-color:#75a5ff}input[type=number]{width:55px;padding:3px;border:1px solid #475368;border-radius:4px;background:#202735;color:#fff}#step{color:#8d9bb0;font-size:10px;margin-top:5px}button:focus-visible,input:focus-visible{outline:2px solid #86b3ff;outline-offset:2px}
      #indicator{color:#8993a3;font-size:16px;cursor:default}#indicator[data-direction=up]{color:#38db8b}#indicator[data-direction=down]{color:#ff5c68}.compact #details{display:none}.compact{padding:8px 12px}
    </style><header id="header"><strong id="heading">SVKO Squawkbox</strong><button id="minimize" aria-label="Minimize Squawkbox" aria-expanded="true">−</button><button id="close" aria-label="Close Squawkbox">×</button></header>
    <div id="details"><div id="symbol-row"><span id="indicator" title="Stopped">●</span><span id="symbol">Select a chart, then Start</span></div><div id="price">—</div>
    <div id="status">Stopped. No symbol is being monitored.</div>
    <div class="row"><button id="start">Start</button><button id="stop" disabled>Stop</button><button id="up">Test up</button><button id="down">Test down</button></div>
    <div class="row settings"><label>Sound volume <input id="volume" type="range" min="0" max="50" step="1" aria-label="Sound volume"></label><label>Detect move (ticks) <input id="ticks" type="number" min="1" max="10000" step="1" aria-label="Detect move (ticks)"></label></div>
    <div id="step">Start locks the selected chart and symbol.</div></div>`;
    ui = Object.fromEntries(['symbol', 'price', 'status', 'start', 'stop', 'up', 'down', 'volume', 'ticks', 'step', 'close', 'header', 'heading', 'indicator', 'minimize']
      .map(id => [id, root.getElementById(id)]));
    const place = (left, top) => {
      const bounds = panel.getBoundingClientRect();
      panel.style.left = `${Math.max(8, Math.min(left, window.innerWidth - bounds.width - 8))}px`;
      panel.style.top = `${Math.max(8, Math.min(top, window.innerHeight - bounds.height - 8))}px`;
    };
    const fit = () => place(parseFloat(panel.style.left), parseFloat(panel.style.top));
    const bounds = panel.getBoundingClientRect();
    place((window.innerWidth - bounds.width) / 2, (window.innerHeight - bounds.height) / 2);
    window.addEventListener('resize', fit);
    let drag;
    ui.header.onpointerdown = event => {
      if (event.button !== 0 || event.target.closest('button')) return;
      const bounds = panel.getBoundingClientRect();
      drag = { x: event.screenX, y: event.screenY, left: bounds.left, top: bounds.top };
      ui.header.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    ui.header.onpointermove = event => {
      if (drag) place(drag.left + event.screenX - drag.x, drag.top + event.screenY - drag.y);
    };
    ui.header.onpointerup = ui.header.onpointercancel = ui.header.onlostpointercapture = () => { drag = null; };
    ui.minimize.onclick = () => {
      const compact = root.body.classList.toggle('compact');
      panel.style.height = compact ? '44px' : '270px';
      ui.heading.textContent = compact && listening ? listening.symbol : 'SVKO Squawkbox';
      if (compact) ui.header.insertBefore(ui.indicator, ui.heading);
      else ui.symbol.before(ui.indicator);
      ui.minimize.textContent = compact ? '□' : '−';
      ui.minimize.setAttribute('aria-label', compact ? 'Restore Squawkbox' : 'Minimize Squawkbox');
      ui.minimize.setAttribute('aria-expanded', String(!compact));
      fit();
    };
    ui.volume.value = String(settings.volume * 100);
    ui.ticks.value = String(settings.ticks);
    ui.start.onclick = start;
    ui.stop.onclick = () => stop();
    ui.close.onclick = () => { stop(); window.removeEventListener('resize', fit); panel.remove(); panel = ui = null; };
    ui.volume.oninput = () => {
      settings.volume = Number(ui.volume.value) / 100;
      if (master) master.gain.value = settings.volume;
    };
    ui.volume.onchange = saveSettings;
    ui.ticks.onchange = () => {
      const value = Number(ui.ticks.value);
      if (!Number.isInteger(value) || value < 1 || value > 10000) { ui.ticks.value = String(settings.ticks); return; }
      settings.ticks = value;
      if (listening) listening.anchor = Math.round(listening.lastPrice / listening.step);
      saveSettings();
    };
    const test = async direction => {
      try {
        if (!await enableAudio()) return;
        play(direction);
        if (!listening) message(`Test ${direction > 0 ? 'up' : 'down'} · no chart is being monitored`);
      } catch (error) { stop(`Audio test failed: ${error.message}`); }
    };
    ui.up.onclick = () => test(1);
    ui.down.onclick = () => test(-1);
  }

  GM_registerMenuCommand('Squawkbox', showPanel);
  window.addEventListener('pagehide', () => stop('Page paused. Press Start to listen again.'));

})();
