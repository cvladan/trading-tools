// ==UserScript==
// @name         SVKO TradingView Watchlist
// @namespace    cvladan.com
// @version      0.2.0
// @description  Show extended session percentages and white hover prices for every watchlist instrument.
// @license      MIT
// @match        https://www.tradingview.com/chart/*
// @icon         https://static.tradingview.com/static/images/favicon.ico
// @noframes
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  if (location.protocol !== 'https:' || location.hostname !== 'www.tradingview.com' ||
      !location.pathname.startsWith('/chart/') || window.top !== window.self) return;

  const BADGE_CLASS = 'svko-tv-watchlist-badge';
  const WIDGET = '[data-test-id-widget-type="watchlist"]';
  const ROW = '[data-symbol-full][data-symbol-short]';
  const REFRESH_MS = 1500;
  const decimalMark = new Intl.NumberFormat(document.documentElement.lang || 'en')
    .formatToParts(1.1).find(part => part.type === 'decimal').value;
  let watchlist;

  // Show extended percentages; other rows show only their price while hovered.
  // Price calculation does not depend on the selected symbol or the Details panel.
  const style = document.createElement('style');
  style.textContent = `
    .${BADGE_CLASS} {
      display: inline-grid;
      flex-shrink: 0;
      align-items: center;
      margin-left: 6px;
      padding: 0 4px;
      height: 16px;
      border-radius: 3px;
      font-size: 11px;
      line-height: 16px;
      font-weight: 600;
      background: transparent;
      color: #d97706;
      white-space: nowrap;
      vertical-align: middle;
    }
    .${BADGE_CLASS}[data-direction="1"] {
      color: #16a34a;
    }
    .${BADGE_CLASS}[data-direction="-1"] {
      color: #dc2626;
    }
    .${BADGE_CLASS}::before, .${BADGE_CLASS}::after {
      grid-area: 1 / 1;
    }
    .${BADGE_CLASS}::before { content: attr(data-percent); }
    .${BADGE_CLASS}::after { content: attr(data-price); visibility: hidden; color: #fff; }
    .${BADGE_CLASS}[data-price]:hover::before { visibility: hidden; }
    .${BADGE_CLASS}[data-price]:hover::after { visibility: visible; }
    .${BADGE_CLASS}[data-session="regular"] { display: none; background: transparent; }
    ${WIDGET} ${ROW}:hover .${BADGE_CLASS}[data-session="regular"][data-price] { display: inline-grid; }
    .${BADGE_CLASS}[data-session="regular"]::after { visibility: visible; }
  `;
  document.head.appendChild(style);

  function cleanText(value) {
    return String(value || '').replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\s]/g, '');
  }

  function readNumber(value, percent = false) {
    let text = cleanText(value).replace(/−/g, '-');
    if (percent) {
      if (!text.endsWith('%')) return null;
      text = text.slice(0, -1);
    }
    if (!/^[+-]?\d[\d.,'’]*$/.test(text)) return null;
    text = text.replace(/['’]/g, '');
    const dot = text.lastIndexOf('.');
    const comma = text.lastIndexOf(',');
    let decimal = decimalMark;
    if (dot >= 0 && comma >= 0) decimal = dot > comma ? '.' : ',';
    else if (dot >= 0 || comma >= 0) {
      const mark = dot >= 0 ? '.' : ',';
      const groups = text.replace(/^[+-]/, '').split(mark);
      const grouped = groups[0].length <= 3 && groups.slice(1).every(group => group.length === 3);
      if (mark === decimalMark || percent || !grouped) decimal = mark;
    }
    const groupMark = decimal === '.' ? ',' : '.';
    const parts = text.split(decimal);
    if (parts.length > 2 || (parts[1] !== undefined && !/^\d+$/.test(parts[1]))) return null;
    const integerGroups = parts[0].replace(/^[+-]/, '').split(groupMark);
    if (integerGroups.length > 1 &&
        (integerGroups[0].length > 3 || integerGroups.slice(1).some(group => !/^\d{3}$/.test(group)))) return null;
    const number = Number(parts[0].split(groupMark).join('') + (parts.length === 2 ? '.' + parts[1] : ''));
    if (!Number.isFinite(number)) return null;
    return { value: number, decimals: parts[1]?.length || 0, decimal };
  }

  function readDisplay(row) {
    for (const cell of row.querySelectorAll('[class*="prePostMarket"]')) {
      const node = cell.querySelector('[data-value*="%"], [class*="changePercent"], [class*="changeInPercents"]') || cell;
      const text = cleanText(node.getAttribute('data-value') || node.textContent);
      const percent = readNumber(text, true);
      if (percent) return { cell, text, percent: percent.value, session: 'extended' };
    }
    return { text: '', percent: 0, session: 'regular' };
  }

  function calculatePrice(row, display) {
    const last = row.querySelector('[class^="last-"], [class*=" last-"]');
    const base = readNumber(last?.textContent);
    if (!base) return null;
    if (display.session === 'regular') return { text: cleanText(last.textContent), approximate: false };
    if (base.value <= 0 || base.decimals > 20) return null;

    // Only a change field inside the extended session cell can override its percentage.
    const change = display.cell.querySelector('[class^="change-"], [class*=" change-"]');
    const absolute = readNumber(change?.textContent);
    const value = absolute ? base.value + absolute.value : base.value * (1 + display.percent / 100);
    if (!Number.isFinite(value) || value < 0 || value >= 1e21) return null;
    return { text: value.toFixed(base.decimals).replace('.', base.decimal), approximate: !absolute };
  }

  function setAttribute(node, name, value) {
    if (value === null) {
      if (node.hasAttribute(name)) node.removeAttribute(name);
    } else if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  }

  function renderRow(row, readPrice = false) {
    const name = row.querySelector('[class*="symbolNameText"]');
    const display = name && readDisplay(row);
    let badge = row.querySelector(`.${BADGE_CLASS}`);
    if (!display) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement('span');
      badge.className = BADGE_CLASS;
    }
    if (badge.previousElementSibling !== name) name.insertAdjacentElement('afterend', badge);
    const symbol = row.getAttribute('data-symbol-full');
    const label = display.session === 'extended' ? 'Pre/Post-market change' : 'Change';
    if (badge.getAttribute('data-symbol') !== symbol || badge.getAttribute('data-percent') !== display.text ||
        badge.getAttribute('data-session') !== display.session) {
      setAttribute(badge, 'data-price', null);
      setAttribute(badge, 'title', `${label} ${display.text}`);
    }
    setAttribute(badge, 'data-symbol', symbol);
    setAttribute(badge, 'data-session', display.session);
    setAttribute(badge, 'data-percent', display.text);
    setAttribute(badge, 'data-direction', String(Math.sign(display.percent) || 0));
    if (readPrice || (display.session === 'regular' ? row.matches(':hover') : badge.matches(':hover'))) {
      const price = calculatePrice(row, display);
      setAttribute(badge, 'data-price', price?.text ?? null);
      setAttribute(badge, 'title', price
        ? display.session === 'regular' ? `Last price ${price.text}`
          : `Calculated pre/post-market price ${price.text} (${display.text}).${price.approximate ? ' Approximate: the source percentage may be rounded.' : ''}`
        : display.session === 'regular' ? 'Price unavailable.' : `${label} ${display.text}. Price unavailable.`);
    }
  }

  function renderAll() {
    if (document.hidden) return;
    if (!watchlist?.isConnected) watchlist = document.querySelector(WIDGET);
    if (!watchlist) return;
    for (const row of watchlist.querySelectorAll(ROW)) renderRow(row);
  }

  document.addEventListener('pointerover', event => {
    const row = event.target.closest?.(ROW);
    if (!row?.closest(WIDGET)) return;
    const badge = event.target.closest(`.${BADGE_CLASS}`);
    if (badge) {
      if (!event.relatedTarget || !badge.contains(event.relatedTarget)) renderRow(row, true);
    } else if ((!event.relatedTarget || !row.contains(event.relatedTarget)) && readDisplay(row).session === 'regular') {
      renderRow(row, true);
    }
  });

  renderAll();
  setInterval(renderAll, REFRESH_MS);
})();
