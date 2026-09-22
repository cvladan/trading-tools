// ==UserScript==
// @name         SVKO TradingView Links
// @namespace    cvladan.com
// @version      0.6.3
// @description  Turn configured TradingView canvas tickers into clickable chart links.
// @author       cvladan
// @icon         https://static.tradingview.com/static/images/favicon.ico
// @match        https://www.tradingview.com/*
// @match        https://*.tradingview.com/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
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
  'use strict';

  const DEFAULT_EXTRA_PREFIXES = 'TRADENATION:, IG:';
  const BASE_PREFIXES = ['NASDAQ', 'NYSE', 'AMEX', 'XETR', 'FWB', 'LSE', 'EURONEXT', 'MIL', 'BME', 'SIX', 'OMXSTO', 'OMXCOP', 'OMXHEX'];
  const TICKER_RE = new RegExp('\\b(?:' + BASE_PREFIXES.concat(normalisePrefixes(GM_getValue('extraPrefixes', DEFAULT_EXTRA_PREFIXES))).map(escapeRegExp).join('|') + '):[A-Z0-9][A-Z0-9._-]*\\b', 'g');
  const HORIZONTAL_PADDING = 8;
  const BOTTOM_PADDING = 8;
  const areas = new Map();
  let hoverBox = null;
  let collectingFrame = false;
  let openInNewTab = GM_getValue('openInNewTab', false);

  GM_registerMenuCommand('Set extra prefixes', function () {
    const value = prompt('Extra ticker prefixes, comma-separated:', GM_getValue('extraPrefixes', DEFAULT_EXTRA_PREFIXES));
    if (value == null) return;
    GM_setValue('extraPrefixes', value);
    location.reload();
  });

  GM_registerMenuCommand('Set link opening', function () {
    openInNewTab = confirm('Open ticker links in a new tab?\n\nOK: new tab\nCancel: same tab');
    GM_setValue('openInNewTab', openInNewTab);
  });

  function normalisePrefixes(value) {
    return String(value).split(',').map(function (prefix) {
      return prefix.trim().toUpperCase().replace(/:$/, '');
    }).filter(Boolean);
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function getHoverBox() {
    if (hoverBox) return hoverBox;
    if (!document.body) return null;

    hoverBox = document.createElement('div');
    hoverBox.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:1px solid #2962ff;box-sizing:border-box;display:none';
    document.body.appendChild(hoverBox);
    return hoverBox;
  }

  function textHeight(ctx, scaleY) {
    const match = String(ctx.font).match(/(\d+(?:\.\d+)?)px/);
    return Math.max(12, (match ? Number(match[1]) : 12) * scaleY);
  }

  function textLeft(ctx, x, width) {
    if (ctx.textAlign === 'center') return x - width / 2;
    if (ctx.textAlign === 'right' || ctx.textAlign === 'end') return x - width;
    return x;
  }

  function rememberArea(symbol, left, top, width, height) {
    const area = {
      symbol,
      left: left - HORIZONTAL_PADDING,
      top,
      width: width + HORIZONTAL_PADDING * 2,
      height: height + BOTTOM_PADDING
    };
    const key = symbol + ':' + Math.round(area.left) + ':' + Math.round(area.top);
    areas.set(key, area);
  }

  function areaAt(x, y) {
    let hit = null;
    for (const area of areas.values()) {
      if (x >= area.left && x <= area.left + area.width && y >= area.top && y <= area.top + area.height) hit = area;
    }
    return hit;
  }

  function clearAreas() {
    areas.clear();
    if (hoverBox) hoverBox.style.display = 'none';
    document.documentElement.style.cursor = '';
  }

  function handleCanvasText(ctx, args) {
    const text = String(args[0] || '');
    const x = Number(args[1]);
    const y = Number(args[2]);
    const canvas = ctx.canvas;
    if (!canvas || !Number.isFinite(x) || !Number.isFinite(y)) return;

    TICKER_RE.lastIndex = 0;
    let match = TICKER_RE.exec(text);
    if (!match) return;

    if (!collectingFrame) {
      clearAreas();
      collectingFrame = true;
      requestAnimationFrame(function () {
        collectingFrame = false;
      });
    }

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || !canvas.width || !canvas.height) return;

    const transform = ctx.getTransform();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;
    const widthScale = Math.abs(transform.a || 1) * scaleX;
    const height = textHeight(ctx, Math.abs(transform.d || 1) * scaleY);
    const drawX = rect.left + (transform.a * x + transform.c * y + transform.e) * scaleX;
    const drawY = rect.top + (transform.b * x + transform.d * y + transform.f) * scaleY;
    const fullWidth = ctx.measureText(text).width * widthScale;
    const left = textLeft(ctx, drawX, fullWidth);
    const top = drawY - height * 0.8;

    do {
      const symbol = match[0];
      const symbolLeft = left + ctx.measureText(text.slice(0, match.index)).width * widthScale;
      const symbolWidth = ctx.measureText(symbol).width * widthScale;
      rememberArea(symbol, symbolLeft, top, symbolWidth, height);
      match = TICKER_RE.exec(text);
    } while (match);
  }

  function patchCanvasText(methodName) {
    const proto = window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype;
    if (!proto || !proto[methodName] || proto[methodName].svkoTradingViewLinks) return;

    const original = proto[methodName];
    proto[methodName] = function () {
      handleCanvasText(this, arguments);
      return original.apply(this, arguments);
    };
    proto[methodName].svkoTradingViewLinks = true;
  }

  document.addEventListener('mousemove', function (event) {
    const area = areaAt(event.clientX, event.clientY);
    const box = getHoverBox();
    document.documentElement.style.cursor = area ? 'pointer' : '';
    if (!box) return;

    box.style.display = area ? 'block' : 'none';
    if (!area) return;

    box.style.left = area.left + 'px';
    box.style.top = area.top + 'px';
    box.style.width = area.width + 'px';
    box.style.height = area.height + 'px';
  }, true);

  document.addEventListener('click', function (event) {
    const area = areaAt(event.clientX, event.clientY);
    if (!area) return;

    event.preventDefault();
    event.stopPropagation();
    const url = 'https://www.tradingview.com/chart/?symbol=' + encodeURIComponent(area.symbol);
    if (event.shiftKey) window.open(url, '_blank', 'noopener,popup');
    else if (event.metaKey || event.ctrlKey || openInNewTab) window.open(url, '_blank', 'noopener');
    else {
      const chart = unsafeWindow.TradingViewApi?._activeChartWidgetWV?.value?.();
      if (typeof chart?.setSymbol === 'function') chart.setSymbol(area.symbol, {});
      else window.location.assign(url);
    }
  }, true);

  window.addEventListener('resize', function () {
    clearAreas();
  }, { passive: true });

  window.addEventListener('scroll', function () {
    clearAreas();
  }, { passive: true, capture: true });

  patchCanvasText('fillText');
  patchCanvasText('strokeText');
}());
