// ==UserScript==
// @name         SVKO TradingView Tab Titles
// @namespace    cvladan.com
// @version      0.6.3
// @description  Set a global TradingView tab title with optional per-tab overrides.
// @author       cvladan
// @icon         https://static.tradingview.com/static/images/favicon.ico
// @match        https://www.tradingview.com/chart/*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @license      LicenseRef-SVKO-Personal-Use-Commercial-1.0; https://trading.cvladan.com/licences/SVKO-1.0.txt
// ==/UserScript==
// Copyright (c) 2026 Vladan Colovic (SVKO).
// SVKO Personal Use and Commercial Licence 1.0.
// Free personal use includes trading real money for your own profit.
// Company, employment and other business use requires a separate paid licence.
// Terms: https://trading.cvladan.com/licences/SVKO-1.0.txt
// Earlier valid licence grants and third-party rights are unaffected.

(() => {
  'use strict';

  const TAB_STORAGE_KEY = 'svko-tab-title';
  const GLOBAL_STORAGE_KEY = 'svko-tab-title-global';
  const EXAMPLE_TITLE = '<title:p5> <title:arrow:v2> <title:p4> <title:p1>';
  const PLACEHOLDERS = [
    { token: '<layout>', selector: '#header-toolbar-save-load span[class^="text-"]' },
    { token: '<symbol>', selector: 'button#header-toolbar-symbol-search span[class^="value-"]' },
  ];
  const ARROWS = [['▲', '▼'], ['↗', '↘'], ['↑', '↓'], ['⭡', '⭣'], ['⇡', '⇣'], ['➚', '➘'], ['⤴', '⤵'], ['Up', 'Down']];
  const TITLE_HELP = `<layout> → Daily
<symbol> → MSFT

For "GOOG.EX 371.59 ▲ +3.46% TN Stocks":
<title:p1> → GOOG.EX
<title:p2> → 371.59
<title:p3> → ▲ or ▼
<title:p4> → +3.46%
<title:p5> → TN Stocks

Arrow alternatives:
<title:arrow> / <title:arrow:v1> → ▲ / ▼
<title:arrow:v2> → ↗ / ↘
<title:arrow:v3> → ↑ / ↓
<title:arrow:v4> → ⭡ / ⭣
<title:arrow:v5> → ⇡ / ⇣
<title:arrow:v6> → ➚ / ➘
<title:arrow:v7> → ⤴ / ⤵
<title:arrow:v8> → Up / Down

Editable example (pre-filled below):
${EXAMPLE_TITLE}`;
  const titleElement = document.querySelector('title') || document.head.appendChild(document.createElement('title'));
  let tabTitle = sessionStorage.getItem(TAB_STORAGE_KEY) || '';
  let globalTitle = localStorage.getItem(GLOBAL_STORAGE_KEY) || '';
  let customTitle = tabTitle || globalTitle;
  let pageTitle = document.title;
  let renderedTitle = null;

  function renderCustomTitle() {
    const title = PLACEHOLDERS.reduce((currentTitle, { token, selector }) => {
      if (!currentTitle.includes(token)) return currentTitle;
      const value = document.querySelector(selector)?.textContent.trim() || '';
      return currentTitle.replaceAll(token, value);
    }, customTitle);
    if (!title.includes('<title:')) return title;
    const parts = pageTitle.trim().match(/^(\S+)\s+(\S+)\s+([▲▼])\s+(\S+%)\s*(.*)$/)?.slice(1) || [];
    const direction = parts[2] === '▲' ? 0 : parts[2] === '▼' ? 1 : -1;
    return title
      .replace(/<title:p([1-5])>/g, (_, part) => parts[part - 1] || '')
      .replace(/<title:arrow(?::v([1-8]))?>/g, (_, version = 1) => ARROWS[version - 1]?.[direction] || '');
  }

  function applyCustomTitle() {
    if (!customTitle) return;
    if (document.title !== renderedTitle) pageTitle = document.title;
    const nextTitle = renderCustomTitle();
    if (document.title === nextTitle) return;
    renderedTitle = nextTitle;
    document.title = nextTitle;
    // Discard this script's pending title mutation so it cannot trigger the observer itself.
    observer.takeRecords();
  }

  function updateCustomTitle() {
    customTitle = tabTitle || globalTitle;
    if (customTitle) {
      applyCustomTitle();
      return;
    }
    renderedTitle = null;
    if (document.title === pageTitle) return;
    document.title = pageTitle;
    observer.takeRecords();
  }

  function promptForTitle(message, value) {
    return prompt(`${message}\n\n${TITLE_HELP}`, value || EXAMPLE_TITLE);
  }

  GM_registerMenuCommand('Set This Tab Title', () => {
    const value = promptForTitle('This tab title (leave blank to use the global title):', tabTitle || globalTitle);
    if (value === null) return;

    tabTitle = value.trim();
    if (tabTitle) sessionStorage.setItem(TAB_STORAGE_KEY, tabTitle);
    else sessionStorage.removeItem(TAB_STORAGE_KEY);
    updateCustomTitle();
  });

  GM_registerMenuCommand('Set Global Tab Title', () => {
    const value = promptForTitle('Global tab title (leave blank to clear):', globalTitle);
    if (value === null) return;

    globalTitle = value.trim();
    if (globalTitle) localStorage.setItem(GLOBAL_STORAGE_KEY, globalTitle);
    else localStorage.removeItem(GLOBAL_STORAGE_KEY);
    if (!tabTitle) updateCustomTitle();
  });

  // Keep exactly one observer: watch only <title>; read toolbar values conditionally when it changes.
  const observer = new MutationObserver(applyCustomTitle);
  observer.observe(titleElement, { childList: true, characterData: true, subtree: true });
  applyCustomTitle();
})();
