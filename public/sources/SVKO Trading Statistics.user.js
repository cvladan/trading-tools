// ==UserScript==
// @name         SVKO Trading Statistics
// @namespace    cvladan.com
// @version      0.4.4
// @description  Archive Trade Nation CFD and Spread transactions and open trading statistics from any page.
// @author       cvladan
// @match        https://*/*
// @match        http://*/*
// @noframes
// @run-at       document-idle
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.getValues
// @grant        GM.setValues
// @grant        GM.listValues
// @grant        GM.getResourceText
// @grant        GM.registerMenuCommand
// @grant        GM.notification
// @grant        GM.openInTab
// @resource     uPlotJS https://cdn.jsdelivr.net/npm/uplot@1.6.32/dist/uPlot.iife.min.js
// @resource     uPlotCSS https://cdn.jsdelivr.net/npm/uplot@1.6.32/dist/uPlot.min.css
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

  const BROKERS = {
    'trade-nation-cfd': { origin: 'https://platform-cfd.tradenation.com', label: 'CFD', method: 'GetTransactionHistoryByCurrency' },
    'trade-nation-spread': { origin: 'https://platform.tradenation.com', label: 'Spread', method: 'GetTransactionHistory' },
  };
  const VERSION = '0.4.4';
  const PREFIX = 'svko-stats:';
  const CATEGORIES = ['Trade P/L', 'Funding charges', 'Funding received', 'Dividends', 'Subscriptions', 'Commissions', 'Other adjustments'];
  let panel = null, activeJob = null, Plot = null;

  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
    return JSON.stringify(value);
  }

  function minor(value) {
    const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value).trim());
    if (!match) return null;
    const amount = Number(match[2]) * 100 + Number((match[3] || '').padEnd(2, '0'));
    return Number.isSafeInteger(amount) ? (match[1] ? -amount : amount) : null;
  }

  function addMoney(a, b) {
    const sum = a + b;
    if (!Number.isSafeInteger(sum)) throw Error('The monetary total exceeds exact integer precision.');
    return sum;
  }

  function dayAt(ms, zone) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(ms);
    const part = type => parts.find(p => p.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  function shiftDay(day, offset) {
    const date = new Date(day + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  }

  function brokerClock() {
    const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    const cache = new Map();
    return text => {
      if (cache.has(text)) return cache.get(text);
      const match = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(text));
      if (!match) return null;
      const [, d, m, y, h, min, s] = match;
      const year = y.length === 2 ? 2000 + Number(y) : Number(y);
      if (year < 2000 || year > 2099) return null;
      const expected = { year: String(year), month: m, day: d, hour: h, minute: min, second: s };
      const utc = Date.UTC(year, Number(m) - 1, Number(d), Number(h), Number(min), Number(s));
      // London uses UTC or UTC+1 in the supported archive years. Preserve ambiguity instead of inventing an offset.
      const candidates = [utc - 3600000, utc].filter(ms => {
        const parts = Object.fromEntries(formatter.formatToParts(ms).map(p => [p.type, p.value]));
        return Object.entries(expected).every(([key, value]) => parts[key] === value);
      });
      const result = candidates.length ? { ms: candidates[0], ambiguous: candidates.length > 1 } : null;
      cache.set(text, result);
      return result;
    };
  }

  function classify(raw) {
    const action = String(raw.Action || '').trim().toLowerCase();
    const description = String(raw.Description || '').trim();
    if (action === 'trade payable' || action === 'trade receivable') return 'Trade P/L';
    if (action === 'funding charges') return 'Funding charges';
    if (action === 'funding refund') return 'Funding received';
    if (action === 'trading adjustment(div)') return 'Dividends';
    if ((action === 'fund payable' || action === 'fund receivable') && /^Currency conversion (?:from|to) /.test(description)) return 'Conversion';
    if ((action === 'fund payable' || action === 'fund receivable') && /^Online Transfer Cash (?:In|Out)$/i.test(description)) return 'Transfer';
    if (action === 'fund payable' && description === 'Subscription Payment') return 'Subscriptions';
    if (action === 'commission' || action === 'commissions') return 'Commissions';
    return 'Unknown';
  }

  function conversionCurrency(raw) {
    const match = /^Currency conversion (?:from ([A-Z]{3})-C to ([A-Z]{3})-C|to ([A-Z]{3})-C from ([A-Z]{3})-C) @ [\d.]+$/.exec(String(raw.Description));
    if (!match) return null;
    const pair = match[1] ? [match[1], match[2]] : [match[3], match[4]];
    return pair.includes('USD') && pair[0] !== pair[1] ? pair.find(c => c !== 'USD') : null;
  }

  function analyse(records, zone) {
    const clock = brokerClock(), rows = [], groups = new Map(), events = [], issues = [];
    for (const entry of records) {
      const raw = entry.raw, time = clock(raw.TransactionDate), cents = minor(raw.ProfitLoss);
      const row = { ...entry, category: classify(raw), currency: String(raw.Currency || ''), cents, ms: time?.ms, day: time ? dayAt(time.ms, zone) : '', usd: null, convertedGroup: null };
      rows.push(row);
      if (!time || cents === null) { row.issue = 'Invalid date or monetary amount'; issues.push(row); continue; }
      if (time.ambiguous) { row.issue = 'Ambiguous London clock during daylight saving change'; issues.push(row); }
      const foreign = row.category === 'Conversion' ? conversionCurrency(raw) : row.currency !== 'USD' ? row.currency : null;
      if (foreign) {
        const key = canonical([entry.accountKey, raw.TransactionDate, foreign]);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      }
      if (row.category === 'Unknown') { row.issue = 'Unclassified transaction'; issues.push(row); }
      if (CATEGORIES.includes(row.category) && row.currency === 'USD') {
        row.usd = cents;
        events.push({ day: row.day, ms: row.ms, accountKey: row.accountKey, market: String(raw.Description), category: row.category, cents, rows: [row] });
      }
    }
    for (const group of groups.values()) {
      const economic = group.filter(r => CATEGORIES.includes(r.category));
      const foreign = economic[0]?.currency;
      const legs = group.filter(r => r.category === 'Conversion');
      const usdLegs = legs.filter(r => r.currency === 'USD');
      const nativeLegs = legs.filter(r => r.currency === foreign);
      const sum = a => a.reduce((total, r) => addMoney(total, r.cents), 0);
      const signature = r => canonical([r.category, r.raw.Description]);
      const canMatch = economic.length && economic.length + legs.length === group.length &&
        new Set(economic.map(signature)).size === 1 && usdLegs.length && nativeLegs.length &&
        legs.every(r => r.currency === 'USD' || r.currency === foreign) && addMoney(sum(economic), sum(nativeLegs)) === 0 &&
        (sum(economic) === 0 ? sum(usdLegs) === 0 : Math.sign(sum(economic)) === Math.sign(sum(usdLegs)));
      if (canMatch) {
        const first = economic[0], cents = sum(usdLegs);
        const event = { day: first.day, ms: first.ms, accountKey: first.accountKey, market: String(first.raw.Description), category: first.category, cents, rows: economic };
        events.push(event);
        for (const row of group) row.convertedGroup = event;
        // A group total is exact; distributing rounded USD cents between individual postings would be an estimate.
        if (economic.length === 1) first.usd = cents;
      } else {
        for (const row of group) if (CATEGORIES.includes(row.category) || row.category === 'Conversion') {
          row.issue = 'Unmatched currency conversion';
          if (!issues.includes(row)) issues.push(row);
        }
      }
    }
    for (const row of rows) if (row.category === 'Conversion' && !row.convertedGroup && !row.issue) {
      row.issue = 'Unmatched currency conversion'; issues.push(row);
    }
    return { rows, events, issues };
  }

  function summarise(data, filter) {
    const accepts = row => (!filter.account || row.accountKey === filter.account) &&
      (!filter.market || (row.market || row.raw?.Description) === filter.market) &&
      row.day && row.day >= filter.from && row.day <= filter.to;
    const rows = data.rows.filter(accepts), events = data.events.filter(accepts);
    const issues = data.issues.filter(row => (!filter.account || row.accountKey === filter.account) &&
      (!filter.market || row.raw.Description === filter.market) && (!row.day || row.day >= filter.from && row.day <= filter.to));
    const categories = Object.fromEntries(CATEGORIES.map(category => [category, 0]));
    const daily = new Map();
    for (const row of rows) if (!daily.has(row.day)) daily.set(row.day, { day: row.day, pl: 0, adjustments: 0, trades: 0, incomplete: false });
    for (const event of events) {
      categories[event.category] = addMoney(categories[event.category], event.cents);
      if (!daily.has(event.day)) daily.set(event.day, { day: event.day, pl: 0, adjustments: 0, trades: 0, incomplete: false });
      const bucket = daily.get(event.day), field = event.category === 'Trade P/L' ? 'pl' : 'adjustments';
      bucket[field] = addMoney(bucket[field], event.cents);
    }
    const trades = rows.filter(r => r.category === 'Trade P/L' && r.cents !== null);
    for (const row of trades) daily.get(row.day).trades++;
    for (const row of issues) if (daily.has(row.day)) daily.get(row.day).incomplete = true;
    const winners = trades.filter(r => r.cents > 0).length, losers = trades.filter(r => r.cents < 0).length;
    const tradeEvents = events.filter(r => r.category === 'Trade P/L');
    const profit = tradeEvents.filter(r => r.cents > 0).reduce((s, r) => addMoney(s, r.cents), 0);
    const loss = -tradeEvents.filter(r => r.cents < 0).reduce((s, r) => addMoney(s, r.cents), 0);
    const adjustments = Object.entries(categories).filter(([k]) => k !== 'Trade P/L').reduce((s, [, v]) => addMoney(s, v), 0);
    const points = trades.reduce((s, r) => {
      const { Amount, OpenPrice, ClosePrice } = r.raw;
      if (![Amount, OpenPrice, ClosePrice].every(v => v !== '' && Number.isFinite(Number(v)))) return s;
      return s + (Number(Amount) > 0 ? 1 : -1) * (Number(ClosePrice) - Number(OpenPrice));
    }, 0);
    return { rows, events, issues, categories, daily, trades: trades.length, winners, losers, flat: trades.length - winners - losers,
      long: trades.filter(r => Number(r.raw.Amount) > 0).length, short: trades.filter(r => Number(r.raw.Amount) < 0).length,
      profit, loss, points, pl: categories['Trade P/L'], adjustments, total: addMoney(categories['Trade P/L'], adjustments) };
  }

  function transferSummary(data, filter, overrides = {}) {
    const all = data.rows.filter(row => row.category === 'Transfer').map(row => {
      const key = recordKey(row.accountKey, row.raw), saved = overrides[key];
      const stale = Boolean(saved && saved.fingerprint !== canonical(row.raw));
      const valid = row.cents !== null && Boolean(row.day) && !row.issue &&
        (row.cents > 0 && /^Online Transfer Cash In$/i.test(row.raw.Description.trim()) && row.raw.Action.trim().toLowerCase() === 'fund receivable' ||
         row.cents < 0 && /^Online Transfer Cash Out$/i.test(row.raw.Description.trim()) && row.raw.Action.trim().toLowerCase() === 'fund payable');
      return { ...row, key, stale, valid, mode: saved && !stale ? saved.mode : 'auto', fingerprint: canonical(row.raw) };
    });
    // ponytail: cash movements are few; index by currency/amount if quadratic pairing becomes costly.
    const candidates = new Map(all.map(row => [row.key, !row.valid || row.stale || row.mode === 'external' ? [] : all.filter(other =>
      other.valid && !other.stale && other.mode !== 'external' && other.accountKey !== row.accountKey &&
      other.currency === row.currency && other.cents === -row.cents && Math.abs(other.ms - row.ms) <= 1000)]));
    for (const row of all) {
      const matches = candidates.get(row.key);
      row.pair = matches.length === 1 && candidates.get(matches[0].key).length === 1 ? matches[0] : null;
      row.internal = row.valid && !row.stale && (row.mode === 'internal' || Boolean(row.pair));
    }
    const rows = all.filter(row => (!filter.account || row.accountKey === filter.account) &&
      (!row.day || row.day >= filter.from && row.day <= filter.to)).sort((a,b) => (b.ms || 0) - (a.ms || 0));
    const totals = new Map();
    for (const row of rows) {
      if (!row.valid) continue;
      if (!totals.has(row.currency)) totals.set(row.currency, { deposits: 0, withdrawals: 0, net: 0, internal: 0 });
      const total = totals.get(row.currency);
      if (row.internal) { total.internal++; continue; }
      const field = row.cents > 0 ? 'deposits' : 'withdrawals';
      total[field] = addMoney(total[field], Math.abs(row.cents));
      total.net = addMoney(total.net, row.cents);
    }
    if (!totals.size) totals.set('USD', { deposits: 0, withdrawals: 0, net: 0, internal: 0 });
    return { rows, totals };
  }

  function validateRaw(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('A transaction must be an object.');
    if (!/^[\w.-]{1,100}$/.test(String(raw.RefID ?? ''))) throw Error('A transaction has no usable reference.');
    if (typeof raw.TransactionDate !== 'string' || !/^[A-Z]{3}$/.test(String(raw.Currency || ''))) throw Error('A transaction has an invalid date or currency field.');
    if (typeof raw.Action !== 'string' || typeof raw.Description !== 'string') throw Error('A transaction has invalid descriptive fields.');
  }

  function validateAccount(account) {
    if (!account || !Object.hasOwn(BROKERS, account.source) || !/^\d{1,30}$/.test(String(account.id)) || account.key !== account.source + ':' + account.id) throw Error('Unsupported or invalid account.');
  }

  function preferences(value = {}) {
    const settings = { weekStart: value.weekStart ?? 0, zone: value.zone || '', reminderDays: value.reminderDays ?? 3, usdSymbol: value.usdSymbol ?? '$', period: value.period ?? '30', account: value.account ?? '', gainThreshold: value.gainThreshold ?? 60, lossThreshold: value.lossThreshold ?? 40 };
    settings.calendarMonth = value.calendarMonth ?? '';
    if (typeof settings.calendarMonth !== 'string' || settings.calendarMonth && !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(settings.calendarMonth)) throw Error('Invalid saved calendar month.');
    const overrides = value.transferOverrides ?? {};
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw Error('Invalid transfer classifications.');
    settings.transferOverrides = Object.fromEntries(Object.entries(overrides).map(([key, item]) => {
      if (!/^svko-stats:record:trade-nation-(?:cfd|spread):\d{1,30}:[\w.-]{1,100}$/.test(key) || !item || !['internal', 'external'].includes(item.mode) || typeof item.fingerprint !== 'string') throw Error('Invalid transfer classification.');
      return [key, { mode: item.mode, fingerprint: item.fingerprint }];
    }));
    if (![0, 1].includes(settings.weekStart)) throw Error('Choose Sunday or Monday as the first calendar day.');
    if (settings.zone) new Intl.DateTimeFormat('en-GB', { timeZone: settings.zone }).format();
    if (!Number.isInteger(settings.reminderDays) || settings.reminderDays < 1 || settings.reminderDays > 365) throw Error('Enter a reminder interval from 1 to 365 days.');
    if (!['$', 'US$'].includes(settings.usdSymbol)) throw Error('Choose $ or US$ for USD amounts.');
    for (const field of ['gainThreshold', 'lossThreshold']) if (typeof settings[field] !== 'number' || settings[field] < 0 || minor(String(settings[field])) === null) throw Error('Enter non-negative calendar thresholds with at most two decimal places.');
    if (typeof settings.account !== 'string') throw Error('Invalid saved account selection.');
    if (!['today', 'yesterday', '7', '30', '90', 'year', 'all', 'custom'].includes(settings.period)) throw Error('Invalid saved period.');
    if (settings.period === 'custom') {
      for (const field of ['customFrom', 'customTo']) {
        const date = value[field], ms = Date.parse(date + 'T00:00:00Z');
        if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== date) throw Error('Invalid saved custom dates.');
        settings[field] = date;
      }
      if (settings.customFrom > settings.customTo) throw Error('Invalid saved custom date range.');
    }
    return settings;
  }

  function validateArchive(value) {
    if (!value || value.format !== 'svko-trading-statistics' || ![1, 2].includes(value.schemaVersion) || !Array.isArray(value.accounts) || !Array.isArray(value.records)) throw Error('Unsupported JSON archive format.');
    const accounts = new Set();
    for (const account of value.accounts) {
      validateAccount(account);
      if (accounts.has(account.key)) throw Error('Duplicate account in the JSON archive.');
      for (const field of ['completedAt', 'coverageFrom', 'lastAttempt']) if (account[field] !== undefined && !Number.isFinite(Date.parse(account[field]))) throw Error('Invalid account coverage date.');
      if (account.completedAt && account.coverageFrom && Date.parse(account.coverageFrom) > Date.parse(account.completedAt)) throw Error('Invalid account coverage interval.');
      if (account.baseCurrency !== 'USD') throw Error('Only USD base accounts are supported.');
      accounts.add(account.key);
    }
    const seen = new Map();
    for (const row of value.records) {
      validateRaw(row.raw);
      if (!accounts.has(row.accountKey) || !Number.isFinite(Date.parse(row.fetchedAt))) throw Error('A transaction has an invalid account or retrieval date.');
      const key = recordKey(row.accountKey, row.raw);
      if (seen.has(key) && seen.get(key) !== canonical(row.raw)) throw Error('Conflicting references in the JSON archive.');
      seen.set(key, canonical(row.raw));
    }
    preferences(value.settings);
    if (value.conflicts && !Array.isArray(value.conflicts)) throw Error('Invalid conflict archive.');
    if ((value.audit !== undefined || value.schemaVersion === 2) && !Array.isArray(value.audit)) throw Error('Invalid audit archive.');
    const auditIds = new Set();
    for (const audit of value.audit || []) {
      if (!audit || !/^[\w-]{1,80}$/.test(audit.id) || auditIds.has(audit.id) || !accounts.has(audit.accountKey) || !['change', 'reconciliation'].includes(audit.kind) || !Number.isFinite(Date.parse(audit.at)) || !Array.isArray(audit.details) || typeof audit.reviewed !== 'boolean') throw Error('Invalid audit entry.');
      if (audit.details.some(d => !d || typeof d.field !== 'string' || typeof d.before !== 'string' || typeof d.after !== 'string')) throw Error('Invalid audit field difference.');
      if (audit.kind === 'change') {
        validateRaw(audit.previous?.raw); validateRaw(audit.incoming?.raw);
        if (audit.previous.accountKey !== audit.accountKey || audit.incoming.accountKey !== audit.accountKey || String(audit.previous.raw.RefID) !== String(audit.incoming.raw.RefID)) throw Error('Invalid audit account or reference.');
      }
      auditIds.add(audit.id);
    }
    return value;
  }

  const EXPORT_FIELDS = { 'Transaction Date': 'TransactionDate', Serial: 'RefID', Action: 'Action', Description: 'Description', Amount: 'Amount', 'Open date': 'OpenPeriod', Opening: 'OpenPrice', Closing: 'ClosePrice', 'P/L': 'ProfitLoss', Status: 'DepWithStatus', Balance: 'Balance', Currency: 'Currency' };

  function parseBrokerExport(text) {
    const rows = []; let row = [], field = '', quoted = false, endedQuote = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') { quoted = false; endedQuote = true; }
        else field += c;
      } else if (c === ',' || c === '\r' || c === '\n') {
        row.push(field); field = ''; endedQuote = false;
        if (c !== ',') { if (row.some(v => v !== '')) rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++; }
      } else if (c === '"' && !field && !endedQuote) quoted = true;
      else { if (endedQuote || c === '"') throw Error('Malformed quoted field in broker export.'); field += c; }
    }
    if (quoted) throw Error('Truncated quoted field in broker export.');
    if (field || row.length || endedQuote) { row.push(field); rows.push(row); }
    const headers = rows.shift();
    if (!headers || headers.length !== Object.keys(EXPORT_FIELDS).length || new Set(headers).size !== headers.length || headers.some(h => !Object.hasOwn(EXPORT_FIELDS, h))) throw Error('Unexpected broker export columns. Verification was not performed.');
    const references = new Set(), clock = brokerClock();
    return rows.map(values => {
      if (values.length !== headers.length) throw Error('Truncated row in broker export.');
      const raw = Object.fromEntries(headers.map((h, i) => [EXPORT_FIELDS[h], values[i]]));
      validateRaw(raw);
      if (!clock(raw.TransactionDate) || minor(raw.ProfitLoss) === null || minor(raw.Balance) === null) throw Error('Invalid broker export date or amount at reference ' + raw.RefID);
      if (references.has(raw.RefID)) throw Error('Duplicate broker export reference ' + raw.RefID);
      references.add(raw.RefID);
      return raw;
    });
  }

  function comparable(raw, field, clock) {
    let value = raw[field];
    if (field === 'RefID') return String(value);
    if (field === 'TransactionDate' || field === 'OpenPeriod') return value ? clock(value)?.ms ?? value : '';
    if (['Amount', 'OpenPrice', 'ClosePrice', 'ProfitLoss', 'Balance'].includes(field)) {
      // The broker exports zero prices for cash entries whose API prices are blank.
      if ((field === 'OpenPrice' || field === 'ClosePrice') && classify(raw) !== 'Trade P/L' && (value === '' || value == null)) value = '0';
      const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(String(value ?? '').trim());
      if (!match) return value ?? '';
      const integer = match[2].replace(/^0+(?=\d)/, ''), fraction = (match[3] || '').replace(/0+$/, '');
      return (match[1] === '-' && (integer !== '0' || fraction) ? '-' : '') + integer + (fraction ? '.' + fraction : '');
    }
    return value ?? '';
  }

  function displayed(value) { return value === undefined ? '(missing)' : canonical(value); }

  function rawDifferences(before, after) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(field => canonical(before[field]) !== canonical(after[field]))
      .map(field => ({ field, before: displayed(before[field]), after: displayed(after[field]) }));
  }

  function reconcile(records, brokerRows, accountKey) {
    const local = new Map(), remote = new Map(), details = [], totals = new Map(), clock = brokerClock();
    for (const entry of records.filter(r => r.accountKey === accountKey)) {
      const ref = String(entry.raw.RefID);
      if (local.has(ref)) throw Error('Duplicate local reference ' + ref);
      local.set(ref, entry.raw);
    }
    for (const raw of brokerRows) {
      const ref = String(raw.RefID);
      if (remote.has(ref)) throw Error('Duplicate broker export reference ' + ref);
      remote.set(ref, raw);
    }
    const difference = (raw, kind, field, before, after) => details.push({ ref: String(raw.RefID), date: raw.TransactionDate, description: raw.Description, kind, field, before, after });
    for (const [ref, raw] of remote) {
      const saved = local.get(ref);
      if (!saved) difference(raw, 'Missing locally', 'Record', '(missing)', 'Present in broker export');
      else for (const field of Object.values(EXPORT_FIELDS)) if (comparable(saved, field, clock) !== comparable(raw, field, clock)) difference(raw, 'Changed field', field, displayed(saved[field]), displayed(raw[field]));
    }
    for (const [ref, raw] of local) if (!remote.has(ref)) difference(raw, 'Not in broker export', 'Record', 'Retained in archive', '(not returned by broker)');
    for (const [side, values] of [['local', local], ['broker', remote]]) for (const raw of values.values()) {
      const cents = minor(raw.ProfitLoss);
      if (cents === null) throw Error('Invalid monetary amount at reference ' + raw.RefID);
      if (!totals.has(raw.Currency)) totals.set(raw.Currency, { currency: raw.Currency, local: 0, broker: 0 });
      const bucket = totals.get(raw.Currency); bucket[side] = addMoney(bucket[side], cents);
    }
    return { status: details.length ? 'different' : 'matched', scope: 'All history currently returned by the broker export', fields: Object.values(EXPORT_FIELDS), localCount: local.size, brokerCount: remote.size,
      differingRecords: new Set(details.map(d => d.ref)).size, details, totals: [...totals.values()].map(t => ({ ...t, difference: addMoney(t.broker, -t.local) })) };
  }

  function notifyCheck(text) {
    try { if (typeof GM.notification === 'function') Promise.resolve(GM.notification({ title: 'Trading statistics', text, onclick: () => openPanel('Data') })).catch(error => console.warn('[SVKO Trading Statistics] Notification:', error.message || error)); }
    catch (error) { console.warn('[SVKO Trading Statistics] Notification:', error.message || error); }
  }

  async function storeAudit(value) {
    const audit = { ...value, id: crypto.randomUUID(), at: new Date().toISOString(), reviewed: false };
    await GM.setValue(PREFIX + 'audit:' + audit.id, audit);
  }

  async function verifyBroker(account, check, progress) {
    let result;
    try {
      await check();
      if (brokerAccount()?.key !== account.key) throw Error('Open the matching signed-in broker account to verify this archive.');
      const key = PREFIX + 'account:' + account.key, current = await GM.getValue(key, account);
      await GM.setValue(key, { ...current, verification: { status: 'checking', at: new Date().toISOString(), details: [] } });
      progress('Verifying all available broker history, including older records…');
      const response = await fetch('/GetTransactionHistoryCSVFile.aspx?days=-1&transType=1' + (account.source === 'trade-nation-cfd' ? '&currency=' : '') + '&platform=' + encodeURIComponent(navigator.platform), { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw Error('Broker export failed: HTTP ' + response.status);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const encoding = bytes[0] === 255 && bytes[1] === 254 ? 'utf-16le' : bytes[0] === 254 && bytes[1] === 255 ? 'utf-16be' : 'utf-8';
      const rows = parseBrokerExport(new TextDecoder(encoding, { fatal: true }).decode(bytes));
      await check();
      if (brokerAccount()?.key !== account.key) throw Error('The signed-in account changed during verification.');
      const keys = (await GM.listValues()).filter(k => k.startsWith(PREFIX + 'record:' + account.key + ':'));
      result = reconcile(Object.values(await GM.getValues(keys)), rows, account.key);
    } catch (error) { result = { status: 'failed', error: error.message, details: [] }; }
    await check();
    result.at = new Date().toISOString();
    const key = PREFIX + 'account:' + account.key, current = await GM.getValue(key, account);
    await GM.setValue(key, { ...current, verification: result, ...(result.status === 'matched' ? {} : { incomplete: true }) });
    if (result.status !== 'matched') {
      await storeAudit({ ...result, accountKey: account.key, kind: 'reconciliation' });
      activeJob.notices.add(result.status === 'different' ? `${result.differingRecords} records differ from the broker export.` : 'Broker verification failed.');
    }
    return result;
  }

  function recordKey(accountKey, raw) { return PREFIX + 'record:' + accountKey + ':' + raw.RefID; }

  function mergeBatch(existing, entries) {
    const writes = {}, conflicts = [], revisions = [];
    for (const entry of entries) {
      validateRaw(entry.raw);
      const key = recordKey(entry.accountKey, entry.raw), old = writes[key] || existing[key];
      if (!old) writes[key] = entry;
      else if (canonical(old.raw) !== canonical(entry.raw)) {
        const revision = { previous: old, incoming: entry, details: rawDifferences(old.raw, entry.raw), resolution: 'Older or equal retrieval date; current record retained' };
        revisions.push(revision);
        if (old.raw.TransactionDate !== entry.raw.TransactionDate || old.raw.OpenPeriod !== entry.raw.OpenPeriod || old.raw.Currency !== entry.raw.Currency) {
          revision.resolution = 'Identity conflict; current record retained';
          conflicts.push({ previous: old, incoming: entry });
        } else if (Date.parse(entry.fetchedAt) > Date.parse(old.fetchedAt)) { writes[key] = entry; revision.resolution = 'Newer source observed'; }
      }
    }
    return { writes, conflicts, revisions };
  }

  function historyPage(response, requested, pages) {
    const data = response?.d?.d;
    if (!data || !Array.isArray(data.records) || !Number.isInteger(data.totalPages) || data.totalPages < 0 || !Number.isInteger(data.currentPage)) throw Error('Invalid history response. Your session may have expired.');
    if (data.totalPages === 0 && data.records.length === 0 && requested === 0) return { records: [], totalPages: 0 };
    if (data.currentPage !== (requested || 1) || (pages !== undefined && pages !== data.totalPages) || (!data.records.length && requested < data.totalPages)) throw Error('History pagination changed. Stop other history queries and pull again.');
    return data;
  }

  function brokerAccount() {
    const match = Object.entries(BROKERS).find(([, broker]) => broker.origin === location.origin);
    if (!match || !/\/Advanced\.aspx$/i.test(location.pathname)) return null;
    const [source, broker] = match, text = document.getElementById('divAccountFlag')?.textContent || '';
    const id = /Account ID\s*(\d+)/i.exec(text)?.[1];
    return id && new RegExp('\\b' + broker.label + '\\s*USD\\b', 'i').test(text) ? { key: source + ':' + id, id, source, name: 'Trade Nation ' + broker.label + ' ' + id, baseCurrency: 'USD' } : null;
  }

  async function readArchive() {
    const snapshotAt = new Date().toISOString(), job = await GM.getValue(PREFIX + 'job', null);
    const keys = (await GM.listValues()).filter(k => k.startsWith(PREFIX) && !k.endsWith('job'));
    const values = await GM.getValues(keys);
    return { format: 'svko-trading-statistics', schemaVersion: 2, appVersion: VERSION, exportedAt: new Date().toISOString(),
      accounts: keys.filter(k => k.startsWith(PREFIX + 'account:')).map(k => job?.until > Date.now() || values[k].lastAttempt > snapshotAt ? { ...values[k], incomplete: true } : values[k]),
      records: keys.filter(k => k.startsWith(PREFIX + 'record:')).map(k => values[k]),
      conflicts: keys.filter(k => k.startsWith(PREFIX + 'conflict:')).map(k => values[k]), audit: keys.filter(k => k.startsWith(PREFIX + 'audit:')).map(k => values[k]), settings: values[PREFIX + 'settings'] || {} };
  }

  async function withJob(task) {
    if (activeJob) throw Error('An import is already running in this tab.');
    const run = async lock => {
      if (!lock) throw Error('Another import is already running.');
      const current = await GM.getValue(PREFIX + 'job', null);
      if (current?.until > Date.now()) throw Error('An import is running in another tab.');
      // ponytail: GM leases are best-effort across origins; native Web Locks serialise same-origin imports.
      const job = { id: crypto.randomUUID(), until: Date.now() + 600000, cancelled: false, notices: new Set(), accounts: [] };
      activeJob = job;
      try {
        await GM.setValue(PREFIX + 'job', { id: job.id, until: job.until });
        const check = async () => {
          if (job.cancelled) throw Error('Import stopped. Saved records are retained; the period remains incomplete.');
          if ((await GM.getValue(PREFIX + 'job', null))?.id !== job.id) throw Error('Another tab acquired the import. Pull again after it finishes.');
          job.until = Date.now() + 600000;
          await GM.setValue(PREFIX + 'job', { id: job.id, until: job.until });
        };
        return await task(check);
      } catch (error) {
        if ((await GM.getValue(PREFIX + 'job', null))?.id === job.id) for (const accountKey of job.accounts) {
          const key = PREFIX + 'account:' + accountKey, current = await GM.getValue(key, null);
          if (current) await GM.setValue(key, { ...current, incomplete: true, verification: { status: 'failed', at: new Date().toISOString(), error: 'Import did not finish: ' + error.message, details: [] } });
        }
        job.notices.add('Import did not finish; broker verification is not current.');
        throw error;
      } finally {
        if ((await GM.getValue(PREFIX + 'job', null))?.id === job.id) await GM.setValue(PREFIX + 'job', null);
        activeJob = null;
        if (job.notices.size) notifyCheck([...job.notices].join(' ') + ' Open Data for details.');
      }
    };
    if (!navigator.locks) throw Error('This page cannot coordinate imports. Open statistics on an HTTPS page.');
    return navigator.locks.request('svko-trading-statistics-import', { ifAvailable: true }, run);
  }

  async function saveEntries(entries, check, source = 'Broker history') {
    const keys = entries.map(r => recordKey(r.accountKey, r.raw));
    const result = mergeBatch(await GM.getValues(keys), entries);
    await check();
    for (const revision of result.revisions) {
      await storeAudit({ ...revision, kind: 'change', source, accountKey: revision.incoming.accountKey });
      activeJob.notices.add('Previously saved transactions have changed.');
    }
    if (result.conflicts.length) {
      await GM.setValues(Object.fromEntries(result.conflicts.map(c => [PREFIX + 'conflict:' + crypto.randomUUID(), c])));
      throw Error('Conflicting references were preserved separately. Review the archive before continuing.');
    }
    const count = Object.keys(result.writes).length;
    if (count) await GM.setValues(result.writes);
    return count;
  }

  async function pullData(mode = 'incremental', progress = () => {}) {
    const account = brokerAccount();
    if (!account) throw Error('Open the signed-in Trade Nation CFD or Spread USD platform to pull data.');
    return withJob(async check => {
      activeJob.accounts = [account.key];
      const key = PREFIX + 'account:' + account.key, previous = await GM.getValue(key, {}), started = new Date().toISOString();
      const days = mode === 'all' || mode === 'incremental' && !previous.completedAt ? -1 : mode === 'incremental' ? Math.max(1, Math.ceil((Date.now() - Date.parse(previous.completedAt)) / 86400000) + 3) : Number(mode);
      if (!(days === -1 || Number.isInteger(days) && days > 0 && days <= 36500)) throw Error('Enter a positive number of days.');
      let changed = 0, count = 0, oldest = Infinity;
      const clock = brokerClock(), seen = new Set();
      await GM.setValue(key, { ...previous, ...account, incomplete: true, lastAttempt: started, verification: { status: 'checking', at: started, details: [] } });
      const read = async (page, totalPages) => {
        await check();
        if (brokerAccount()?.key !== account.key) throw Error('The signed-in account changed.');
        const response = await fetch('/UTSAPI.asmx/' + BROKERS[account.source].method, { method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transType: 1, days, page, ...(account.source === 'trade-nation-cfd' ? { currencyCode: '' } : {}) }), signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw Error('History request failed: HTTP ' + response.status);
        const data = historyPage(await response.json(), page, totalPages);
        if (brokerAccount()?.key !== account.key) throw Error('The signed-in account changed.');
        const entries = [];
        for (const raw of data.records) {
          try { validateRaw(raw); } catch (error) {
            await GM.setValue(PREFIX + 'conflict:' + crypto.randomUUID(), { accountKey: account.key, raw, error: error.message, fetchedAt: started });
            throw Error('An invalid broker record was preserved separately. ' + error.message);
          }
          if (seen.has(String(raw.RefID))) throw Error('A reference repeated across history pages. Pull again without other history queries.');
          seen.add(String(raw.RefID));
          oldest = Math.min(oldest, clock(raw.TransactionDate)?.ms ?? Infinity);
          entries.push({ accountKey: account.key, fetchedAt: started, raw });
        }
        changed += await saveEntries(entries, check);
        count += entries.length;
        progress(`Page ${page || 1} of ${data.totalPages || 1} · ${count.toLocaleString('en-GB')} records · ${changed.toLocaleString('en-GB')} new or changed`);
        return data;
      };
      const first = await read(0);
      for (let page = 2; page <= first.totalPages; page++) await read(page, first.totalPages);
      await check();
      if (brokerAccount()?.key !== account.key) throw Error('The signed-in account changed.');
      const coverageFrom = days === -1 ? (Number.isFinite(oldest) ? new Date(oldest).toISOString() : started) : new Date(Date.parse(started) - days * 86400000).toISOString();
      const overlaps = previous.completedAt && previous.coverageFrom && coverageFrom <= previous.completedAt;
      const verification = await verifyBroker(account, check, progress);
      const matched = verification.status === 'matched';
      await GM.setValue(key, { ...previous, ...account, incomplete: !matched, lastAttempt: started, lastCount: count, verification,
        ...(matched ? { completedAt: started, fullHistory: days === -1 || Boolean(overlaps && previous.fullHistory), coverageFrom: overlaps && previous.coverageFrom < coverageFrom ? previous.coverageFrom : coverageFrom } : {}) });
      progress(`${count.toLocaleString('en-GB')} records read · ${changed.toLocaleString('en-GB')} new or changed · Broker check: ${verification.status}`);
      return { count, changed, verification };

    });
  }

  async function importArchive(value, progress = () => {}) {
    validateArchive(value);
    return withJob(async check => {
      activeJob.accounts = value.accounts.map(a => a.key);
      let changed = 0;
      const completedAccounts = {};
      for (const account of value.accounts) {
        const key = PREFIX + 'account:' + account.key, old = await GM.getValue(key, null);
        const latest = !old || Date.parse(account.completedAt || '') >= Date.parse(old.completedAt || '') || !old.completedAt ? account : old;
        // Keep the latest known interval; a backup must not claim coverage across an uncollected gap.
        completedAccounts[key] = { ...latest, incomplete: latest.incomplete !== false, verification: { status: 'pending', error: 'JSON restored; a fresh check against the matching broker account is required.', details: [] } };
        await check(); await GM.setValue(key, { ...(old || account), incomplete: true, verification: { status: 'pending', error: 'JSON import in progress; a fresh broker check is required.', details: [] } });
      }
      for (let i = 0; i < value.records.length; i += 100) {
        changed += await saveEntries(value.records.slice(i, i + 100), check, 'JSON import');
        progress(`${Math.min(i + 100, value.records.length)} of ${value.records.length} records · ${changed} new or changed`);
      }
      await check();
      if (value.conflicts?.length) await GM.setValues(Object.fromEntries(value.conflicts.map(c => [PREFIX + 'conflict:' + crypto.randomUUID(), c])));
      if (value.settings) await GM.setValue(PREFIX + 'settings', preferences(value.settings));
      await check();
      await GM.setValues(completedAccounts);
      for (const audit of value.audit || []) {
        const key = PREFIX + 'audit:' + audit.id, old = await GM.getValue(key, null);
        if (old && canonical({ ...old, reviewed: false }) !== canonical({ ...audit, reviewed: false })) throw Error('Conflicting audit ID in JSON archive.');
        if (!old) { await check(); await GM.setValue(key, audit); }
      }
      const account = brokerAccount();
      let verification = null;
      if (account && value.accounts.some(a => a.key === account.key)) verification = await verifyBroker(account, check, progress);
      if (value.accounts.some(a => a.key !== account?.key)) activeJob.notices.add('JSON restored; some accounts still need a broker check.');
      progress(`JSON imported · ${changed} new or changed records · Broker check: ${verification?.status || 'pending'}`);
      return { changed, verification };

    });
  }

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function button(text, action, className) {
    const node = element('button', text, className);
    node.type = 'button'; node.onclick = action;
    return node;
  }

  function snapChartCursor(plot, left, top) {
    if (left < 0 || top < 0 || !plot.data[0].length) return [left, top];
    return [plot.valToPos(plot.data[0][plot.posToIdx(left)], 'x'), top];
  }

  function bestCalendarDay(days) {
    return days.reduce((best, day) => !best || day.pl + day.adjustments > best.pl + best.adjustments || (day.pl + day.adjustments === best.pl + best.adjustments && day.day < best.day) ? day : best, null)?.day;
  }

  function monthRange(month) {
    const last = new Date(month + '-01T12:00:00Z');
    last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
    return { from: month + '-01', to: month + '-' + String(last.getUTCDate()).padStart(2, '0') };
  }

  function periodIsCovered(accounts, from, to, zone) {
    if (from > to) return true;
    return accounts.length > 0 && accounts.every(a => !a.incomplete && a.coverageFrom && a.completedAt &&
      from >= dayAt(Date.parse(a.coverageFrom), zone) && to <= dayAt(Date.parse(a.completedAt), zone));
  }

  function calendarStart(first, weekStart) {
    return shiftDay(first, -(new Date(first + 'T12:00:00Z').getUTCDay() - weekStart + 7) % 7);
  }

  function calendarShade(amount, gainThreshold, lossThreshold, trades) {
    if (!trades || !amount) return '';
    const threshold = amount > 0 ? gainThreshold : lossThreshold;
    return (amount > 0 ? ' gain-' : ' loss-') + (Math.abs(amount) > threshold ? 2 : 1);
  }

  function pullIsDue(accounts, days, now = Date.now()) {
    return !accounts.length || accounts.some(a => !Number.isFinite(Date.parse(a.completedAt)) || now - Date.parse(a.completedAt) > days * 86400000);
  }

  function compareFunding(a, b, column) {
    const value = ([market, row]) => [market, row.paid, row.received, row.paid + row.received, row.count][column];
    return column === 0 ? a[0].localeCompare(b[0], 'en-GB') : value(a) - value(b) || a[0].localeCompare(b[0], 'en-GB');
  }

  function formatMoney(cents, currency = 'USD', usdSymbol = '$') {
    if (cents === null || cents === undefined) return 'N/A';
    const formatted = new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(cents / 100);
    return currency === 'USD' ? formatted.replace('US$', usdSymbol) : formatted;
  }

  function calendarEquation(pl, adjustments, usdSymbol) {
    const net = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(addMoney(pl, adjustments) / 100);
    return `P/L ${formatMoney(pl, 'USD', usdSymbol)} ${adjustments < 0 ? '−' : '+'} ${formatMoney(Math.abs(adjustments), 'USD', usdSymbol)} = ${net}`;
  }

  function downloadJSON(value) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = element('a');
    link.href = url; link.download = 'Trading Statistics ' + new Date().toISOString().slice(0, 10) + '.json';
    link.hidden = true; panel.dialog.append(link); link.click(); link.remove();
    // Release on the next task, after the browser has accepted the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function loadPlot() {
    if (Plot) return Plot;
    if (!crypto.subtle) throw Error('Open statistics on an HTTPS page to load verified charts.');
    const source = await GM.getResourceText('uPlotJS');
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))), b => b.toString(16).padStart(2, '0')).join('');
    if (digest !== '19c8d4c6ad88929a79f4ae49d6f7161566dfd0ba3d15cc495e974f787eb78f1f') throw Error('The cached uPlot resource failed its integrity check. Reinstall this script.');
    // The pinned, verified resource executes in the userscript sandbox only when charts are requested.
    Plot = Function(source + '\nreturn uPlot;')();
    return Plot;
  }

  async function openPanel(initialPage) {
    if (panel) { if (initialPage === 'Data') panel.showData(); panel.dialog.focus(); return; }
    const host = element('div');
    const shadow = host.attachShadow({ mode: 'closed' });
    const dialog = element('dialog');
    dialog.setAttribute('aria-label', 'Trading statistics');
    const style = element('style', `
      :host{all:initial} *{box-sizing:border-box} dialog{color-scheme:light;scrollbar-gutter:stable;border:1px solid #dce1e7;border-radius:12px;padding:0;width:1380px;max-width:96vw;height:92vh;max-height:96vh;background:#fff;color:#202b39;font:14px/1.5 system-ui,sans-serif;box-shadow:0 18px 80px #0004} dialog::backdrop{background:#17202d88} button,input,select{font:inherit;color:inherit} button,select,input{border:1px solid #cfd6df;border-radius:6px;padding:7px 11px;background:#fff} button{cursor:pointer} button:hover{background:#edf3fa} button:disabled{opacity:.5;cursor:default} :focus-visible{outline:3px solid #88b7ed;outline-offset:2px} button.primary{background:#246399;color:white;border-color:#246399} h1{font-size:22px;line-height:1.2;margin:0} h2{font-size:16px;margin:0 0 15px} h3{font-size:14px;margin:0 0 10px} p{margin:8px 0} .muted{color:#6b7684;font-size:12px}.positive{color:#226397}.negative{color:#c93535}.top{position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid #e2e6ec;padding:20px 28px 0}.heading,.actions,.filters,.navigation,.calendar-heading{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.heading{justify-content:space-between}.subtitle{margin:0;font-size:12px;text-align:right}.data-reminder{background:#fff6dc;color:#795400;border-color:#ead7a1;font-size:12px}.close{font-size:24px;border:0;padding:0 8px}.navigation{gap:22px;margin-top:12px}.navigation button{border:0;border-radius:0;padding:11px 0;background:none;border-bottom:3px solid transparent;color:#6b7684}.navigation button.active{color:#246399;border-bottom-color:#246399;font-weight:600}.filters{padding:16px 28px;background:#f7f9fb;border-bottom:1px solid #e2e6ec;gap:12px}.filters label{display:flex;gap:5px;align-items:center;font-size:12px;color:#586476}.filters select{max-width:250px}.body{padding:24px 28px}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-bottom:22px}.card{border:1px solid #e0e5eb;border-radius:8px;padding:18px}.card-label{font-size:12px;color:#6b7684}.card-value{font-size:28px;font-weight:600;margin-top:4px;letter-spacing:-.5px}.card small{display:block;color:#6b7684;margin-top:5px}.cost-summary{display:grid;grid-template-columns:220px minmax(0,1fr);gap:18px 28px;border:1px solid #e0e5eb;border-radius:8px;padding:20px;margin-bottom:12px;align-items:center}.cost-summary .card{border:0;padding:0}.cost-summary h2{font-size:14px;margin-bottom:12px}.cost-breakdown{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px 24px;margin:0}.cost-breakdown dt{font-size:12px;color:#6b7684}.cost-breakdown dd{font-size:16px;font-weight:500;margin:3px 0 0}.cost-total{grid-column:1/-1;border-top:1px solid #e2e6ec;padding-top:12px;display:flex;justify-content:space-between;gap:12px;font-size:13px}.body[data-view="Costs"]>h2{margin-top:20px}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:22px 0}.metrics .card-value{font-size:22px}.chart{position:relative;margin:22px 0 28px;padding-top:18px;border-top:1px solid #e2e6ec;min-width:0}.plot{width:100%;min-height:270px}.u-cursor-x{border-right:1px solid #d5d9df!important}.tooltip{position:absolute;transition:left 250ms ease-out,top 250ms ease-out;z-index:5;pointer-events:none;background:#fff;border:1px solid #dce1e7;border-radius:6px;box-shadow:0 3px 12px #0002;padding:10px 13px;min-width:165px;white-space:pre-line;color:#202b39;font:12px/1.7 system-ui}.status{padding:9px 28px;margin:0;color:#546478;background:#eef4fa;font-size:12px;min-height:35px}.warning{padding:10px 14px;background:#fff6dc;color:#795400;border:1px solid #ead7a1;border-radius:6px;margin-bottom:16px}.table-wrap{overflow:auto;max-height:58vh;border:1px solid #e2e6ec;border-radius:7px}table{border-collapse:collapse;width:100%;font-size:12px;white-space:nowrap}th{position:sticky;top:0;background:#f4f6f9;text-align:left;z-index:1;color:#647184;font-weight:500}th,td{padding:9px 12px;border-bottom:1px solid #edf0f4}.body[data-view="Transfers"] th,.body[data-view="Transfers"] td,.body[data-view="Transactions"] th,.body[data-view="Transactions"] td,.body[data-view="Costs"] th,.body[data-view="Costs"] td{padding:5px 12px}.body[data-view="Transactions"] td button,.body[data-view="Costs"] td button{padding:0 6px}th button.sort{border:0;border-radius:0;padding:0;background:none;font:inherit;color:inherit}td.number,th.number{text-align:right}tbody tr:hover{background:#f6f9fd}tr.internal-transfer{background:#f4f6f8;color:#697482}tr.internal-transfer:hover{background:#edf0f3}.transfer-type{font-size:12px;padding:3px 6px}.transfer-note{margin-bottom:14px}td button{font-size:12px;padding:2px 6px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f6f9;padding:14px;border-radius:6px;font:12px/1.5 ui-monospace,monospace}.pager{display:flex;align-items:center;gap:12px;margin-top:10px}.calendar-heading{justify-content:space-between;flex-wrap:nowrap;margin-bottom:12px}.calendar-heading:focus{outline:none}.calendar-title{flex:1;text-align:center}.calendar-title h2{margin:0}.calendar-notice{margin:2px 0 0;font-size:11px;line-height:14px;color:#795400}.calendar-notice.neutral{color:#6b7684}.calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}.weekday{text-align:center;color:#7a8491;font-size:12px;padding:7px}.day{border:0;border-radius:16px;height:119px;min-height:119px;padding:8px;text-align:right;background:#f4f6f8;display:flex;flex-direction:column;gap:3px}.day b,.day small,.day .day-amount{align-self:center}.day span.day-amount{font-weight:400}.day .day-amount{font-size:16px;line-height:21px}.day .day-amount.best-day{color:#ffeb00}.day .day-breakdown{position:relative;margin-top:0;padding-top:16px;font-size:10px;line-height:1.4;text-align:center;white-space:normal;overflow-wrap:anywhere}.day .day-breakdown::before{content:"";position:absolute;top:6.5px;left:50%;width:32px;transform:translateX(-50%);border-top:1px solid currentColor;opacity:.2}.day.gain-1{background:#16a654;color:#fff}.day.gain-2{background:#009943;color:#fff}.day.loss-1{background:#b45b56;color:#fff}.day.loss-2{background:#c83f37;color:#fff}.day.incomplete{outline:2px solid #d59b26;outline-offset:-2px}.day.outside{opacity:.4}.calendar-total.gain{color:#168244}.calendar-total.loss{color:#c93535}.calendar-total{background:#f4f7fa;text-align:center;padding:8px;margin-bottom:10px;border-radius:5px}.empty{padding:45px 12px;text-align:center;color:#6b7684}.settings{max-width:700px}.settings label{display:block;margin:16px 0}.settings input{margin-left:12px;min-width:220px}.details{margin-top:20px}.controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px}[hidden]{display:none!important}@media(prefers-reduced-motion:reduce){.tooltip{transition:none}}@media(max-width:760px){.cost-summary{grid-template-columns:1fr;padding:16px;gap:16px}.cost-breakdown{grid-template-columns:repeat(2,minmax(0,1fr))}.top{padding:16px 16px 0}.body,.filters{padding:16px}.cards{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,1fr)}.day{padding:5px;font-size:11px}.navigation{gap:14px}.card-value{font-size:23px}.filters label{flex-wrap:wrap}.filters select{max-width:180px}}
    `);
    shadow.append(style, dialog); document.documentElement.append(host);
    const previousFocus = document.activeElement;
    let archive, data, summary, zone, page = initialPage === 'Data' ? 'Data' : 'Overview', plots = [], renderId = 0, moveMonth = null;
    const filter = { account: '', market: '', from: '', to: '' };
    const fundingSort = { column: 0, direction: 1 };
    function money(cents, currency = 'USD') { return formatMoney(cents, currency, archive.settings.usdSymbol); }
    const top = element('header', undefined, 'top'), heading = element('div', undefined, 'heading');
    const title = element('h1', 'Trading statistics');
    const close = button('×', () => dialog.close(), 'close'); close.setAttribute('aria-label', 'Close trading statistics');
    const reminder = button('Update data', () => { page = 'Data'; render(); }, 'data-reminder'); reminder.hidden = true;
    const headingActions = element('div', undefined, 'actions'); headingActions.append(element('p', 'Your trading archive stored in Userscript', 'muted subtitle'), reminder, close);
    heading.append(title, headingActions); top.append(heading);
    const navigation = element('nav', undefined, 'navigation'); navigation.setAttribute('aria-label', 'Statistics views');
    const navButtons = new Map();
    for (const name of ['Overview', 'Calendar', 'Transactions', 'Costs', 'Transfers', 'Data', 'Settings']) {
      const tab = button(name, () => { page = name; render(); }); navButtons.set(name, tab); navigation.append(tab);
    }
    top.append(navigation);
    const filters = element('section', undefined, 'filters');
    const accountSelect = element('select'), marketSelect = element('select'), periodSelect = element('select');
    const from = element('input'), to = element('input'); from.type = to.type = 'date';
    const calendarMonth = element('input'); calendarMonth.type = 'month';
    function field(label, input) { const wrapper = element('label', label); wrapper.append(input); filters.append(wrapper); return input; }
    field('Account', accountSelect); field('Instrument', marketSelect); field('Period', periodSelect); field('From', from); field('To', to); field('Month', calendarMonth);
    for (const [value, text] of [['today','Today'],['yesterday','Yesterday'],['7','Last 7 days'],['30','Last 30 days'],['90','Last 90 days'],['year','This year'],['all','All stored data'],['custom','Custom dates']]) {
      const option = element('option', text); option.value = value; periodSelect.append(option);
    }
    periodSelect.value = '30';
    const status = element('p', 'Loading archive…', 'status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const body = element('main', undefined, 'body');
    dialog.append(top, filters, status, body);
    function destroyPlots() { for (const plot of plots) plot.destroy(); plots = []; }
    const resize = () => { for (const plot of plots) plot.setSize({ width: Math.max(220, plot.root.parentElement.clientWidth), height: 280 }); };
    window.addEventListener('resize', resize);
    dialog.onclose = () => {
      renderId++; destroyPlots(); window.removeEventListener('resize', resize); host.remove(); panel = null;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
    panel = { dialog, setStatus: text => {
      status.textContent = text;
      shadow.querySelector('[data-import-start]')?.toggleAttribute('disabled', Boolean(activeJob));
      shadow.querySelector('[data-import-stop]')?.toggleAttribute('disabled', !activeJob);
    }, reload: () => refresh(), showData: () => { page = 'Data'; render(); } };
    dialog.onkeydown = event => {
      if (page !== 'Calendar' || !moveMonth || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.target.closest('input,select,textarea,[contenteditable]')) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); moveMonth(event.key === 'ArrowLeft' ? -1 : 1, true); }
    };
    dialog.showModal(); close.focus();

    function options(select, entries, value) {
      select.replaceChildren();
      for (const [id, label] of entries) { const option = element('option', label); option.value = id; select.append(option); }
      select.value = entries.some(([id]) => id === value) ? value : '';
    }
    function setDates() {
      const today = dayAt(Date.now(), zone), value = periodSelect.value;
      if (page === 'Calendar') {
        calendarMonth.value = archive.settings.calendarMonth || today.slice(0, 7);
        Object.assign(filter, monthRange(calendarMonth.value));
        return;
      }
      if (value !== 'custom') {
        to.value = value === 'yesterday' ? shiftDay(today, -1) : today;
        from.value = value === 'year' ? today.slice(0, 4) + '-01-01' : value === 'all' ? data.rows.map(r => r.day).filter(Boolean).sort()[0] || today : value === 'today' || value === 'yesterday' ? to.value : shiftDay(today, 1 - Number(value));
      }
      filter.from = from.value; filter.to = to.value;
    }
    async function refresh() {
      archive = await readArchive();
      archive.settings = preferences(archive.settings);
      if (!host.isConnected) return;
      zone = archive.settings.zone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      data = analyse(archive.records, zone);
      options(accountSelect, [['','All accounts'], ...archive.accounts.map(a => [a.key, a.name])], archive.settings.account);
      filter.account = accountSelect.value;
      options(marketSelect, [['','All instruments'], ...[...new Set(data.rows.filter(r => CATEGORIES.includes(r.category)).map(r => r.raw.Description))].sort().map(m => [m,m])], filter.market);
      periodSelect.value = archive.settings.period;
      if (archive.settings.period === 'custom') { from.value = archive.settings.customFrom; to.value = archive.settings.customTo; }
      setDates();
      const latest = archive.accounts.map(a => a.completedAt).filter(Boolean).sort().at(-1);
      status.textContent = `${archive.records.length.toLocaleString('en-GB')} stored records · ${zone} · ${latest ? 'Last complete pull: ' + new Date(latest).toLocaleString('en-GB') : 'No complete pull yet'}`;
      render();
    }
    accountSelect.onchange = () => { filter.account = accountSelect.value; saveSelection({ account: filter.account }); render(); };
    marketSelect.onchange = () => { filter.market = marketSelect.value; render(); };
    function saveSelection(changes) {
      archive.settings = preferences({ ...archive.settings, ...changes });
      GM.setValue(PREFIX + 'settings', archive.settings).catch(error => { status.hidden = false; status.textContent = 'Could not save selection: ' + error.message; });
    }
    function applyPeriod() {
      setDates();
      if (filter.from && filter.to && filter.from <= filter.to) saveSelection({ period: periodSelect.value, customFrom: from.value, customTo: to.value });
      render();
    }
    calendarMonth.onchange = () => {
      if (!calendarMonth.value || !calendarMonth.validity.valid) return;
      saveSelection({ calendarMonth: calendarMonth.value }); render();
    };
    periodSelect.onchange = applyPeriod;
    for (const input of [from, to]) input.onchange = () => { periodSelect.value = 'custom'; applyPeriod(); };

    function card(label, value, note) {
      const node = element('div', undefined, 'card');
      node.append(element('div', label, 'card-label'), element('div', typeof value === 'number' ? money(value) : value, 'card-value' + (typeof value === 'number' ? value < 0 ? ' negative' : ' positive' : '')));
      if (note) node.append(element('small', note));
      return node;
    }
    function table(parent, headers, rows) {
      const wrapper = element('div', undefined, 'table-wrap'), node = element('table'), head = element('thead'), header = element('tr'), content = element('tbody');
      for (const label of headers) header.append(element('th', label));
      head.append(header);
      for (const values of rows) {
        const row = element('tr');
        for (const value of values) { const cell = element('td'); if (value && typeof value === 'object' && value.nodeType) cell.append(value); else cell.textContent = String(value ?? ''); row.append(cell); }
        content.append(row);
      }
      node.append(head, content); wrapper.append(node); parent.append(wrapper);
      if (!rows.length) parent.append(element('p', 'No records for this selection.', 'empty'));
      return node;
    }
    function sourceDetails(parent, row) {
      parent.querySelector('.raw-detail')?.remove();
      const block = element('section', undefined, 'raw-detail details');
      block.append(element('h3', 'Original transaction ' + row.raw.RefID), element('pre', JSON.stringify(row.raw, null, 2)));
      if (row.convertedGroup) block.append(element('p', 'Broker conversion group: ' + money(row.convertedGroup.cents) + ' across ' + row.convertedGroup.rows.length + ' original postings. Individual USD amounts are not estimated.', 'muted'));
      parent.append(block);
    }
    function transactions(parent, rows) {
      let index = 0;
      const area = element('div'), pager = element('div', undefined, 'pager'), label = element('span', '', 'muted');
      const sorted = [...rows].sort((a,b) => (b.ms || 0) - (a.ms || 0));
      const prev = button('Previous', () => { index--; draw(); }), next = button('Next', () => { index++; draw(); });
      pager.append(prev, label, next); parent.append(area, pager);
      function draw() {
        area.replaceChildren();
        table(area, ['Date / time', 'Instrument / description', 'Category', 'Quantity', 'Original P/L', 'USD', 'Reference'], sorted.slice(index * 100, index * 100 + 100).map(row => {
          const ref = button(String(row.raw.RefID), () => sourceDetails(parent, row)); ref.title = 'Show all original fields';
          return [row.ms === undefined ? row.raw.TransactionDate : new Intl.DateTimeFormat('en-GB', { timeZone: zone, dateStyle: 'short', timeStyle: 'medium' }).format(row.ms), row.raw.Description, row.category + (row.issue ? ' · ' + row.issue : ''), row.raw.Amount,
            money(row.cents, /^[A-Z]{3}$/.test(row.currency) ? row.currency : 'USD'), row.usd === null ? row.convertedGroup ? 'Group ' + money(row.convertedGroup.cents) : 'N/A' : money(row.usd), ref];
        }));
        prev.disabled = index === 0; next.disabled = (index + 1) * 100 >= sorted.length;
        label.textContent = `Page ${index + 1} of ${Math.max(1, Math.ceil(sorted.length / 100))} · ${sorted.length} records`;
      }
      draw();
    }
    function transfers(parent) {
      const result = transferSummary(data, filter, archive.settings.transferOverrides);
      for (const [currency, total] of result.totals) {
        const cards = element('div', undefined, 'cards');
        cards.append(card('Deposits · ' + currency, money(total.deposits, currency)), card('Withdrawals · ' + currency, money(total.withdrawals, currency)),
          card('Net deposited · ' + currency, money(total.net, currency), 'Deposits minus withdrawals'));
        parent.append(cards);
      }
      parent.append(element('p', 'Internal transfers are grey and excluded. Automatic matches require one opposite entry on another saved account, in the same currency and amount, within one second. This is inferred from the records, not a broker-provided transfer ID. Unpaired movements are included in deposits and withdrawals; review them if another account’s history is missing.', 'muted transfer-note'));
      parent.append(element('p', 'Account and period filters apply; the instrument filter does not. Matching uses all saved accounts and dates. You can override each entry below; mark both legs when classifying a transfer manually.', 'muted transfer-note'));
      const review = result.rows.filter(row => !row.valid || row.stale);
      if (review.length) parent.append(element('p', `${review.length} cash movements need review. Invalid entries are excluded; changed records need their previous manual classification checked again.`, 'warning'));
      let index = 0;
      const area = element('div'), detail = element('div'), pager = element('div', undefined, 'pager'), label = element('span', '', 'muted'), message = element('p');
      message.setAttribute('role', 'status');
      const previous = button('Previous', () => { index--; draw(); }), next = button('Next', () => { index++; draw(); });
      pager.append(previous, label, next); parent.append(area, pager, message, detail);
      const accountName = row => archive.accounts.find(a => a.key === row.accountKey)?.name || row.accountKey;
      function draw() {
        area.replaceChildren();
        const visible = result.rows.slice(index * 100, index * 100 + 100);
        const node = table(area, ['Date / time', 'Account', 'Cash movement', 'Amount', 'Classification', 'Reference'], visible.map(row => {
          const choice = element('select', undefined, 'transfer-type');
          options(choice, [['auto', row.pair ? 'Internal · automatic match' : 'External · unpaired'], ['internal', 'Internal · manual'], ['external', 'External · manual']], row.mode);
          choice.setAttribute('aria-label', 'Classification for reference ' + row.raw.RefID);
          choice.disabled = !row.valid;
          choice.onchange = async () => {
            choice.disabled = true;
            try {
              const latest = preferences(await GM.getValue(PREFIX + 'settings', {}));
              if (choice.value === 'auto') delete latest.transferOverrides[row.key];
              else latest.transferOverrides[row.key] = { mode: choice.value, fingerprint: row.fingerprint };
              await GM.setValue(PREFIX + 'settings', latest); await refresh();
            } catch (error) { choice.disabled = !row.valid; choice.value = row.mode; message.textContent = 'Could not save classification: ' + error.message; }
          };
          const classification = element('div'); classification.append(choice);
          if (row.pair) classification.append(element('div', accountName(row.pair) + ' · Ref ' + row.pair.raw.RefID, 'muted'));
          if (row.stale || !row.valid) classification.append(element('div', row.stale ? 'Source changed · review classification' : 'Invalid cash movement · excluded', 'negative'));
          const ref = button(String(row.raw.RefID), () => sourceDetails(detail, row)); ref.title = 'Show all original fields';
          return [row.ms === undefined ? row.raw.TransactionDate : new Intl.DateTimeFormat('en-GB', { timeZone: zone, dateStyle: 'short', timeStyle: 'medium' }).format(row.ms),
            accountName(row), row.raw.Description, money(row.cents, row.currency), classification, ref];
        }));
        visible.forEach((row, i) => { if (row.internal) node.tBodies[0].rows[i].classList.add('internal-transfer'); });
        previous.disabled = index === 0; next.disabled = (index + 1) * 100 >= result.rows.length;
        label.textContent = `Page ${index + 1} of ${Math.max(1, Math.ceil(result.rows.length / 100))} · ${result.rows.length} cash movements · ${result.rows.filter(row => row.internal).length} internal entries excluded`;
      }
      draw();
    }

    function adjustmentDetails(parent) {
      const overview = element('section', undefined, 'cost-summary');
      overview.append(card('Net funding', addMoney(summary.categories['Funding charges'], summary.categories['Funding received']), 'Funding paid plus funding received'));
      const breakdown = element('div'), items = element('dl', undefined, 'cost-breakdown');
      breakdown.append(element('h2', 'Adjustments details'));
      for (const category of CATEGORIES.filter(c => c !== 'Trade P/L')) {
        const item = element('div'), amount = summary.categories[category];
        item.append(element('dt', category === 'Funding charges' ? 'Funding paid' : category), element('dd', money(amount), amount < 0 ? 'negative' : amount > 0 ? 'positive' : ''));
        items.append(item);
      }
      breakdown.append(items);
      const total = element('div', undefined, 'cost-total');
      total.append(element('span', 'Total adjustments'), element('strong', money(summary.adjustments), summary.adjustments < 0 ? 'negative' : summary.adjustments > 0 ? 'positive' : ''));
      overview.append(breakdown, total); parent.append(overview);
      parent.append(element('p', 'Booked adjustments include funding for positions that are still open. Unknown or unmatched amounts are listed separately.', 'muted'));
    }
    function metrics(parent) {
      const nodes = element('div', undefined, 'metrics');
      const priced = summary.rows.filter(r => r.category === 'Trade P/L').every(r => r.usd !== null);
      const avgProfit = priced && summary.winners ? summary.profit / summary.winners : null;
      const avgLoss = priced && summary.losers ? summary.loss / summary.losers : null;
      nodes.append(card('Closed trades', String(summary.trades)), card('Long / short', `${summary.long} / ${summary.short}`), card('Winners / losers / flat', `${summary.winners} / ${summary.losers} / ${summary.flat}`),
        card('Win rate', summary.trades ? (100 * summary.winners / summary.trades).toFixed(2) + '%' : 'N/A'),
        card('Average profit', avgProfit === null ? 'N/A' : money(avgProfit)), card('Average loss', avgLoss === null ? 'N/A' : money(-avgLoss)),
        card('Profit/loss ratio', avgProfit !== null && avgLoss ? (avgProfit / avgLoss).toFixed(2) + ':1' : 'N/A'),
        card('Profit factor', priced && summary.loss ? (summary.profit / summary.loss).toFixed(2) : 'N/A'));
      parent.append(nodes);
      if (filter.market) parent.append(element('p', 'Price points for this instrument: ' + summary.points.toFixed(4) + '. Unweighted price differences; point values differ between instruments.', 'muted'));
    }
    function calendar(parent, coverageIncomplete) {
      const month = calendarMonth.value, first = filter.from, last = filter.to;
      const header = element('div', undefined, 'calendar-heading');
      header.tabIndex = -1;
      moveMonth = (offset, arrowKey = false) => {
        const date = new Date(first + 'T12:00:00Z'); date.setUTCMonth(date.getUTCMonth() + offset);
        saveSelection({ calendarMonth: date.toISOString().slice(0, 7) }); render();
        body.querySelector(arrowKey ? '.calendar-heading' : offset < 0 ? '[aria-label="Previous month"]' : '[aria-label="Next month"]').focus({ preventScroll: true });
      };
      const previous = button('‹', () => moveMonth(-1));
      const next = button('›', () => moveMonth(1));
      previous.setAttribute('aria-label', 'Previous month'); previous.title = 'Previous month (Left arrow)';
      next.setAttribute('aria-label', 'Next month'); next.title = 'Next month (Right arrow)';
      const title = element('div', undefined, 'calendar-title');
      const currentMonth = dayAt(Date.now(), zone).slice(0, 7);
      const notice = element('p', coverageIncomplete ? 'DATA DOES NOT COVER THE FULL SELECTED PERIOD. SHOWING AVAILABLE RECORDS.' : month === currentMonth ? 'CURRENT MONTH' : month > currentMonth ? 'FUTURE MONTH' : '', 'calendar-notice' + (coverageIncomplete ? '' : ' neutral'));
      if (!notice.textContent) { notice.textContent = 'CURRENT MONTH'; notice.style.visibility = 'hidden'; }
      title.append(element('h2', new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(first + 'T12:00:00Z'))), notice);
      header.append(previous, title, next);
      parent.append(header);
      const monthly = [...summary.daily.values()].filter(d => d.day.startsWith(month));
      const bestDay = bestCalendarDay(monthly);
      const gainThreshold = minor(String(archive.settings.gainThreshold)), lossThreshold = minor(String(archive.settings.lossThreshold));
      const monthlyPL = monthly.reduce((sum, d) => addMoney(sum, d.pl), 0), monthlyAdjustments = monthly.reduce((sum, d) => addMoney(sum, d.adjustments), 0);
      const monthlyNet = addMoney(monthlyPL, monthlyAdjustments), monthlyTrades = monthly.reduce((sum, d) => sum + d.trades, 0);
      parent.append(element('div', `Month P&L: ${money(monthlyPL)} ${monthlyAdjustments < 0 ? '−' : '+'} ${money(Math.abs(monthlyAdjustments))} = ${money(monthlyNet)}${monthly.some(d => d.incomplete) ? '*' : ''} · ${monthlyTrades} closed trades`, 'calendar-total ' + (monthlyNet === 0 ? '' : monthlyNet > 0 ? 'gain' : 'loss')));
      const grid = element('div', undefined, 'calendar-grid'), detail = element('div', undefined, 'details');
      const weekStart = archive.settings.weekStart, weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      for (let n = 0; n < 7; n++) grid.append(element('div', weekdays[(n + weekStart) % 7], 'weekday'));
      const start = calendarStart(first, weekStart);
      for (let day = start, n = 0; n < 42; n++, day = shiftDay(day, 1)) {
        const selectedDay = day, value = summary.daily.get(day), amount = value ? value.pl + value.adjustments : 0;
        const cell = button('', () => {
          detail.replaceChildren(element('h2', 'Transactions on ' + selectedDay));
          if (value) detail.append(element('p', `P/L ${money(value.pl)} · Adjustments ${money(value.adjustments)} · Total ${money(amount)}`));
          transactions(detail, summary.rows.filter(r => r.day === selectedDay));
        }, 'day' + (day < first || day > last ? ' outside' : '') + calendarShade(amount, gainThreshold, lossThreshold, value?.trades || 0) + (value?.incomplete ? ' incomplete' : ''));
        cell.setAttribute('aria-label', day + (value ? ' ' + money(amount) + ', ' + value.trades + ' closed trades' : ', no stored activity'));
        cell.append(element('span', String(Number(day.slice(8)))));
        if (value) {
          const breakdown = calendarEquation(value.pl, value.adjustments, archive.settings.usdSymbol) + (value.incomplete ? '*' : '');
          cell.append(element(value.trades ? 'b' : 'span', money(amount) + (value.incomplete ? '*' : ''), 'day-amount' + (day === bestDay ? ' best-day' : '')));
          if (value.trades) cell.append(element('small', value.trades + (value.trades === 1 ? ' trade' : ' trades')), element('small', breakdown, 'day-breakdown'));
          cell.setAttribute('aria-label', cell.getAttribute('aria-label') + '. ' + breakdown + (day === bestDay ? '. Best day of the month.' : ''));
        }
        grid.append(cell);
      }
      parent.append(grid, element('p', `Colours become more vivid above a daily net gain of ${money(gainThreshold)} or loss of ${money(lossThreshold)}. Change these fixed thresholds in Settings. Days without closed trades are light grey. Use Left and Right arrow keys to browse months when not editing a filter. The amount added to or subtracted from P/L includes overnight funding, dividends and other booked adjustments. Empty cells mean no stored activity. An asterisk marks an incomplete result.`, 'muted'), detail);
    }
    function funding(parent) {
      adjustmentDetails(parent);
      parent.append(element('h2', 'Funding by instrument'));
      const byMarket = new Map();
      for (const event of summary.events.filter(e => e.category.startsWith('Funding '))) {
        if (!byMarket.has(event.market)) byMarket.set(event.market, { paid: 0, received: 0, count: 0 });
        const row = byMarket.get(event.market); const field = event.category === 'Funding charges' ? 'paid' : 'received'; row[field] = addMoney(row[field], event.cents); row.count += event.rows.length;
      }
      const details = element('div', undefined, 'details'), area = element('div');
      parent.append(area);
      function draw() {
        area.replaceChildren();
        const headers = ['Instrument', 'Funding paid', 'Funding received', 'Net funding', 'Postings'];
        const node = table(area, headers, [...byMarket].sort((a,b) => fundingSort.direction * compareFunding(a, b, fundingSort.column)).map(([market,r]) => [button(market, () => {
          details.replaceChildren(element('h2', market)); transactions(details, summary.rows.filter(row => row.raw.Description === market && row.category.startsWith('Funding ')));
        }), money(r.paid), money(r.received), money(r.paid + r.received), r.count]));
        [...node.tHead.rows[0].cells].forEach((cell, column) => {
          const selected = fundingSort.column === column;
          cell.setAttribute('aria-sort', selected ? fundingSort.direction === 1 ? 'ascending' : 'descending' : 'none');
          const sort = button(headers[column] + (selected ? fundingSort.direction === 1 ? ' ▲' : ' ▼' : ' ↕'), () => {
            fundingSort.direction = selected ? -fundingSort.direction : 1; fundingSort.column = column; draw();
            area.querySelectorAll('th button')[column].focus();
          }, 'sort');
          sort.title = 'Sort ' + headers[column] + (selected && fundingSort.direction === 1 ? ' descending' : ' ascending');
          cell.replaceChildren(sort);
        });
      }
      draw();
      parent.append(details, element('p', 'Funding is attributed to the instrument named by the broker. A specific position ID is not available in these postings.', 'muted'));
    }
    function differences(parent, entries) {
      if (!entries.length) return;
      let index = 0;
      const area = element('div'), pager = element('div', undefined, 'pager'), label = element('span');
      const previous = button('Previous differences', () => { index--; draw(); }), next = button('Next differences', () => { index++; draw(); });
      pager.append(previous, label, next); parent.append(area, pager);
      function draw() {
        area.replaceChildren();
        table(area, ['Reference', 'Broker date', 'Instrument / description', 'Finding', 'Field', 'Stored / previous', 'Broker / incoming'], entries.slice(index * 100, index * 100 + 100).map(d => [d.ref, d.date, d.description, d.kind, d.field, d.before, d.after]));
        previous.disabled = index === 0; next.disabled = (index + 1) * 100 >= entries.length;
        label.textContent = `${entries.length} field differences · Page ${index + 1} of ${Math.ceil(entries.length / 100)}`;
      }
      draw();
    }

    function checks(parent) {
      const accounts = archive.accounts.filter(a => !filter.account || a.key === filter.account);
      parent.append(element('h2', 'Broker reconciliation and change history'), element('p', 'Checks cover the entire available broker export, regardless of the date and instrument filters. Missing records are retained, never deleted automatically.', 'muted'));
      const signedIn = brokerAccount();
      if (signedIn && (!filter.account || filter.account === signedIn.key)) parent.append(button('Check broker now', async () => {
        try {
          const result = await withJob(async check => { activeJob.accounts = [signedIn.key]; return verifyBroker(signedIn, check, text => panel?.setStatus(text)); });
          await refresh(); status.textContent = 'Broker check: ' + result.status;
        } catch (error) { await refresh(); status.textContent = error.message; }
      }));
      for (const account of accounts) {
        const report = account.verification, section = element('section', undefined, 'details');
        section.append(element('h2', account.name));
        section.append(element('p', `Latest broker check: ${report?.status || 'not checked'}${report?.at ? ' · ' + new Date(report.at).toLocaleString('en-GB') : ''}`, report?.status === 'matched' ? 'positive' : 'warning'));
        if (report?.error) section.append(element('p', report.error));
        if (report?.brokerCount !== undefined) section.append(element('p', `${report.localCount} local records · ${report.brokerCount} broker records · ${report.differingRecords} differing references`));
        section.append(element('p', 'All 12 exported fields are compared by reference. Date formats and insignificant decimal zeros are normalised. The five API-only fields are checked for changes when re-fetched. Separate broker responses are not an atomic snapshot.', 'muted'));
        if (report?.totals) table(section, ['Currency', 'Local posting total', 'Broker posting total', 'Broker minus local'], report.totals.map(t => [t.currency, money(t.local, t.currency), money(t.broker, t.currency), money(t.difference, t.currency)]));
        section.append(element('p', 'These control totals include transfers and conversion legs in each original currency. They are not the trading return shown in Overview.', 'muted'));
        differences(section, report?.details || []); parent.append(section);
      }
      const audit = archive.audit.filter(a => !filter.account || a.accountKey === filter.account).sort((a,b) => b.at.localeCompare(a.at));
      parent.append(element('h2', 'Saved warnings and source changes'));
      if (!audit.length) { parent.append(element('p', 'No changes or failed checks recorded.')); return; }
      parent.append(button('Mark saved warnings as reviewed', async () => {
        try { await GM.setValues(Object.fromEntries(audit.filter(a => !a.reviewed).map(a => [PREFIX + 'audit:' + a.id, { ...a, reviewed: true }]))); await refresh(); }
        catch (error) { status.textContent = error.message; }
      }));
      const area = element('div'), pager = element('div', undefined, 'pager'), label = element('span'); let index = 0;
      const previous = button('Previous warnings', () => { index--; draw(); }), next = button('Next warnings', () => { index++; draw(); });
      pager.append(previous, label, next); parent.append(area, pager);
      function draw() {
        area.replaceChildren();
        for (const item of audit.slice(index * 20, index * 20 + 20)) {
          const entry = element('details', undefined, 'details'), title = element('summary');
          title.textContent = `${new Date(item.at).toLocaleString('en-GB')} · ${item.accountKey} · ${item.kind === 'change' ? item.source + ' · Reference ' + item.incoming.raw.RefID : 'Broker check: ' + item.status} · ${item.reviewed ? 'Reviewed' : 'Unreviewed'}`;
          entry.append(title);
          if (item.error) entry.append(element('p', item.error));
          if (item.resolution) entry.append(element('p', item.resolution));
          entry.ontoggle = () => {
            if (!entry.open || entry.dataset.loaded) return;
            entry.dataset.loaded = 'true';
            const raw = item.incoming?.raw;
            differences(entry, raw ? item.details.map(d => ({ ...d, ref: raw.RefID, date: raw.TransactionDate, description: raw.Description, kind: item.resolution })) : item.details);
          };
          area.append(entry);
        }
        previous.disabled = index === 0; next.disabled = (index + 1) * 20 >= audit.length;
        label.textContent = `${audit.length} saved warnings · Page ${index + 1} of ${Math.ceil(audit.length / 20)}`;
      }
      draw();
    }

    function settings(parent) {
      const section = element('section', undefined, 'settings'), status = element('p', undefined, 'preferences-status'); status.setAttribute('role', 'status');
      const report = text => body.querySelector('.preferences-status')?.replaceChildren(text);
      section.append(element('h2', 'Archive and display settings'));
      const label = element('label', 'Reporting time zone'), input = element('input'), list = element('datalist'); list.id = 'svko-statistics-zones'; input.setAttribute('list', list.id);
      input.placeholder = 'Automatic (' + Intl.DateTimeFormat().resolvedOptions().timeZone + ')'; input.value = archive.settings.zone || '';
      for (const value of ['UTC', ...Intl.supportedValuesOf('timeZone')]) { const option = element('option'); option.value = value; list.append(option); }
      label.append(input); section.append(label, list);
      const thresholdLabel = element('label', 'Remind to pull after (days)'), threshold = element('input');
      threshold.type = 'number'; threshold.min = '1'; threshold.max = '365'; threshold.step = '1'; threshold.value = archive.settings.reminderDays;
      thresholdLabel.append(threshold);
      const symbolLabel = element('label', 'USD symbol'), symbol = element('select');
      options(symbol, [['$', '$'], ['US$', 'US$']], archive.settings.usdSymbol); symbolLabel.append(symbol);
      const weekLabel = element('label', 'Calendar week starts on'), week = element('select');
      options(week, [['0', 'Sunday'], ['1', 'Monday']], String(archive.settings.weekStart)); weekLabel.append(week);
      const gainLabel = element('label', 'Vivid green above gain (USD)'), gain = element('input');
      const lossLabel = element('label', 'Vivid red above loss (USD)'), loss = element('input');
      for (const [control, value] of [[gain, archive.settings.gainThreshold], [loss, archive.settings.lossThreshold]]) { control.type = 'number'; control.min = '0'; control.step = '0.01'; control.value = value; }
      gainLabel.append(gain); lossLabel.append(loss);
      section.append(thresholdLabel, symbolLabel, weekLabel, gainLabel, lossLabel, button('Save preferences', async () => {
        try {
          if (!threshold.value.trim()) throw Error('Enter a reminder interval.');
          if (!gain.value.trim() || !loss.value.trim()) throw Error('Enter both calendar colour thresholds.');
          const selected = preferences({ ...archive.settings, weekStart: Number(week.value), gainThreshold: Number(gain.value), lossThreshold: Number(loss.value), zone: input.value.trim(), reminderDays: Number(threshold.value), usdSymbol: symbol.value });
          await GM.setValue(PREFIX + 'settings', selected); await refresh(); report('Preferences saved.');
        } catch (error) { report(error.message); }
      }));
      section.append(element('p', 'The first day of the week affects only the calendar layout. Leave the time zone empty to follow your browser. Original broker timestamps are retained and interpreted as London time.', 'muted'));
      section.append(status, element('h2', 'JSON backup'));
      const controls = element('div', undefined, 'controls'), file = element('input'); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true;
      controls.append(button('Export JSON archive', async () => { try { downloadJSON(await readArchive()); report('JSON download requested. Complete the browser’s Save prompt if shown.'); } catch (error) { report(error.message); } }), button('Import JSON archive', () => file.click()));
      file.onchange = async () => {
        if (!file.files[0]) return;
        try {
          // ponytail: a JSON archive is held in memory; use streaming only if archives outgrow browser memory.
          const value = JSON.parse(await file.files[0].text());
          const result = await importArchive(value, text => { report(text); }); await refresh(); report('JSON imported · Broker check: ' + (result.verification?.status || 'pending'));
        } catch (error) { await refresh(); report(error.message); }
        file.value = '';
      };
      section.append(controls, file, element('p', 'Backups contain financial data. Keep a copy outside the browser: removing the userscript or browser profile may remove its archive.', 'muted'));
      section.append(element('h2', 'Stored accounts'));
      table(section, ['Account', 'Coverage starts', 'Last complete pull', 'Status'], archive.accounts.map(a => [a.name, a.coverageFrom?.slice(0,10) || 'Unknown', a.completedAt ? new Date(a.completedAt).toLocaleString('en-GB') : 'Never', a.incomplete ? 'Incomplete pull' : a.fullHistory ? 'All available history collected' : 'Limited history']));
      if (archive.conflicts.length) {
        section.append(element('p', archive.conflicts.length + ' preserved conflicts. These are included in JSON exports and excluded from the calculated result.', 'warning'));
        section.append(button('Show preserved conflicts', () => { section.append(element('pre', JSON.stringify(archive.conflicts, null, 2))); }));
      }
      parent.append(section);
    }

    async function charts(parent, id) {
      const line = element('section', undefined, 'chart'), bars = element('section', undefined, 'chart');
      const linePlot = element('div', undefined, 'plot'), barsPlot = element('div', undefined, 'plot');
      line.append(element('h2', 'Cumulative total return over time'), linePlot); bars.append(element('h2', 'Daily total return'), barsPlot); parent.append(line, bars);
      try {
        const U = await loadPlot(), css = await GM.getResourceText('uPlotCSS');
        if (!host.isConnected || id !== renderId) return;
        if (!shadow.querySelector('[data-uplot-style]')) { const sheet = element('style', css); sheet.dataset.uplotStyle = ''; shadow.append(sheet); }
        const days = [];
        for (let day = filter.from; day <= filter.to; day = shiftDay(day, 1)) {
          if (days.length > 36600) throw Error('Select a period shorter than 100 years.');
          days.push(summary.daily.get(day) || { day, pl: 0, adjustments: 0, trades: 0 });
        }
        let cumulative = 0;
        const cumulativeValues = days.map(d => (cumulative = addMoney(cumulative, addMoney(d.pl, d.adjustments))) / 100);
        const dailyValues = days.map(d => (d.pl + d.adjustments) / 100);
        function create(target, daily) {
          const tooltip = element('div', undefined, 'tooltip'); tooltip.hidden = true;
          const values = daily ? [dailyValues.map(v => v >= 0 ? v : null), dailyValues.map(v => v < 0 ? v : null)] : [cumulativeValues];
          const opts = { width: Math.max(220, target.clientWidth), height: 280, padding: [14, 18, 0, 0], legend: { show: false }, select: { show: false },
            cursor: { move: snapChartCursor, drag: { x: false, y: false }, y: false, points: { ...(daily ? { show: false } : {}), size: 8, width: 1, stroke: '#286698', fill: '#b9d7ee' } },
            scales: { x: { time: false, range: (_,min,max) => min === max ? [min - .5, max + .5] : [min - (daily ? .5 : 0), max + (daily ? .5 : 0)] }, y: { auto: true, range: (_,min,max) => U.rangeNum(Math.min(0,min), Math.max(0,max), .15, true) } },
            axes: [{ stroke: '#788494', grid: { show: false }, incrs: [1,2,5,7,14,30,60,90,180,365,730,3650], values: (_, ticks) => ticks.map(i => days[Math.round(i)]?.day.slice(5).split('-').reverse().join('/') || '') }, { stroke: '#788494', size: 75, grid: { stroke: '#e9edf2', width: 1 }, values: (_,ticks) => ticks.map(v => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2, notation: 'compact' }).format(v)) }],
            series: [{} , ...values.map((_,index) => ({ label: daily ? index ? 'Loss' : 'Gain' : 'Cumulative total return', stroke: daily ? index ? '#c93535' : '#286698' : summary.total < 0 ? '#c93535' : '#286698',
              ...(daily ? { fill: index ? '#c93535' : '#286698', paths: U.paths.bars({ size: [.7, 35] }), points: { show: false } } : { width: 1.5, points: { show: false } }) }))],
            hooks: { ready: [u => { u.over.append(tooltip); }], setCursor: [u => {
              const index = u.cursor.idx, d = days[index];
              if (!d || u.cursor.left < 0 || u.cursor.top < 0) { tooltip.hidden = true; return; }
              tooltip.textContent = d.day + '\n' + (daily ? `Total return  ${money(d.pl + d.adjustments)}\nClosed P/L  ${money(d.pl)}\nAdjustments  ${money(d.adjustments)}\nClosed trades  ${d.trades}` : 'Cumulative total return\n' + money(Math.round(cumulativeValues[index] * 100))) + (d.incomplete ? '\nIncomplete USD result' : '');
              tooltip.hidden = false; tooltip.style.left = Math.max(0, Math.min(u.cursor.left + 15, u.over.clientWidth - tooltip.offsetWidth)) + 'px'; tooltip.style.top = Math.max(0, Math.min(u.cursor.top + 10, u.over.clientHeight - tooltip.offsetHeight)) + 'px';
            }] } };
          const plot = new U(opts, [days.map((_,i) => i), ...values], target); plots.push(plot);
        }
        create(linePlot, false); create(barsPlot, true);
        parent.append(element('p', 'USD amounts. The cumulative curve starts at zero for the selected period. Days without stored entries are drawn at zero; archive coverage and incomplete conversions are reported above.', 'muted'));
      } catch (error) { if (id === renderId) linePlot.textContent = 'Charts could not load: ' + error.message; }
    }

    function dataControls(parent) {
      const controls = element('div', undefined, 'controls'), mode = element('select'); mode.setAttribute('aria-label', 'History to pull');
      for (const [value,label] of [['incremental','New and recent records'],['7','Last 7 days'],['30','Last 30 days'],['90','Last 90 days'],['custom','Number of days'],['all','All available history']]) { const option = element('option', label); option.value = value; mode.append(option); }
      const days = element('input'); days.type = 'number'; days.min = '1'; days.max = '36500'; days.value = '30'; days.hidden = true; days.setAttribute('aria-label', 'Number of days to pull'); days.style.width = '95px'; mode.onchange = () => { days.hidden = mode.value !== 'custom'; };
      const pull = button('Pull data', async () => {
        pull.disabled = true; stop.disabled = false;
        try { const result = await pullData(mode.value === 'custom' ? days.value : mode.value, text => { status.textContent = text; }); await refresh(); status.textContent = `${result.count} records read · ${result.changed} new or changed · Broker check: ${result.verification.status}`; }
        catch (error) { await refresh(); status.textContent = error.message; }
        finally { pull.disabled = false; stop.disabled = true; }
      }, 'primary');
      const stop = button('Stop import', () => { if (activeJob) activeJob.cancelled = true; }); stop.disabled = !activeJob;
      pull.dataset.importStart = ''; stop.dataset.importStop = ''; pull.disabled = Boolean(activeJob);
      const signedIn = brokerAccount();
      if (signedIn && (!filter.account || filter.account === signedIn.key)) controls.append(mode, days, pull, stop);
      else for (const [source, broker] of Object.entries(BROKERS)) if (!filter.account || archive.accounts.find(a => a.key === filter.account)?.source === source) controls.append(button('Open Trade Nation ' + broker.label, () => GM.openInTab(broker.origin + '/', { active: true })));
      controls.append(button('Refresh view', () => refresh().catch(error => { status.textContent = error.message; })));
      parent.append(controls);
    }

    function render() {
      const id = ++renderId;
      destroyPlots(); body.replaceChildren(); body.dataset.view = page; moveMonth = null;
      setDates();
      for (const control of [periodSelect, from, to]) control.parentElement.hidden = page === 'Calendar';
      calendarMonth.parentElement.hidden = page !== 'Calendar';
      status.hidden = page !== 'Data';
      marketSelect.disabled = page === 'Transfers';
      for (const [name,node] of navButtons) { node.classList.toggle('active', name === page); node.setAttribute('aria-current', name === page ? 'page' : 'false'); }
      const accounts = archive.accounts.filter(a => !filter.account || a.key === filter.account);
      const unreviewed = archive.audit.filter(a => !a.reviewed && (!filter.account || a.accountKey === filter.account)).length;
      const notVerified = accounts.filter(a => a.verification?.status !== 'matched');
      const due = pullIsDue(accounts, archive.settings.reminderDays);
      reminder.hidden = !due && !unreviewed && !notVerified.length;
      reminder.textContent = due ? '● Update data' : '● Data needs review';
      reminder.title = due ? `No complete pull within ${archive.settings.reminderDays} days. Open Data.` : 'Open Data to review broker checks and changes.';
      if (page === 'Data') {
        dataControls(body);
        if (unreviewed || notVerified.length) body.append(element('p', `${unreviewed} saved warnings need review. ${notVerified.length} accounts have no current matching broker check.`, 'warning'));
        else if (accounts.length) body.append(element('p', 'Latest broker export check matched all 12 exported fields. See below for the verification time and scope.', 'muted'));
        checks(body); return;
      }
      if (page === 'Settings') { settings(body); return; }
      if (!filter.from || !filter.to || filter.from > filter.to) { body.append(element('p', 'Choose a valid date range.', 'warning')); return; }
      summary = summarise(data, page === 'Transfers' ? { ...filter, market: '' } : filter);
      const today = dayAt(Date.now(), zone);
      const coverageTo = page === 'Calendar' && filter.to > today ? today : filter.to;
      const coverageIncomplete = !periodIsCovered(accounts, filter.from, coverageTo, zone);
      if (coverageIncomplete && page !== 'Calendar') body.append(element('p', 'DATA DOES NOT COVER THE FULL SELECTED PERIOD. SHOWING AVAILABLE RECORDS.', 'warning'));
      if (page === 'Transfers') { transfers(body); return; }
      if (summary.issues.length || archive.conflicts.length) {
        const warning = element('div', undefined, 'warning');
        warning.append(element('span', `${summary.issues.length} selected postings need review; ${archive.conflicts.length} preserved conflicts. USD totals may be incomplete. `), button('Review postings', () => {
          page = 'Transactions'; render();
          const review = element('section', undefined, 'details'); review.append(element('h2', 'Postings requiring review')); transactions(review, summary.issues); body.prepend(review);
        })); body.append(warning);
      }
      if (!archive.records.length) { body.append(element('p', 'Your archive is empty. Open the Trade Nation CFD or Spread USD platform to collect history, or import a JSON archive in Settings.', 'empty')); return; }
      if (page === 'Overview') {
        const cards = element('div', undefined, 'cards');
        cards.append(card('Total return', summary.total, summary.issues.length ? 'Incomplete USD result' : 'Closed P/L plus booked adjustments'), card('P/L from closed positions', summary.pl, summary.trades + ' closed trades'));
        const adjustments = card('Total adjustments', summary.adjustments, 'Includes funding for open positions'); adjustments.append(button('Check details', () => { page = 'Costs'; render(); })); cards.append(adjustments); body.append(cards);
        const chartArea = element('div'); body.append(chartArea); charts(chartArea, id); metrics(body);
      } else if (page === 'Calendar') calendar(body, coverageIncomplete);
      else if (page === 'Costs') funding(body);
      else if (page === 'Transactions') transactions(body, summary.rows);
    }
    try { await refresh(); } catch (error) { status.textContent = error.message; }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { monthRange, periodIsCovered, transferSummary, brokerAccount, snapChartCursor, bestCalendarDay, calendarStart, pullIsDue, preferences, formatMoney, calendarEquation, calendarShade, compareFunding, parseBrokerExport, reconcile, rawDifferences, verifyBroker, EXPORT_FIELDS, pullData, importArchive, readArchive, addMoney, minor, brokerClock, dayAt, shiftDay, classify, conversionCurrency, analyse, summarise, validateRaw, validateArchive, mergeBatch, historyPage, recordKey };
    return;
  }
  GM.registerMenuCommand('Open trading statistics', openPanel);
  if (location.hash === '#svko-trading-statistics') openPanel().catch(error => console.warn('[SVKO Trading Statistics]', error.message));
  if (Object.values(BROKERS).some(broker => broker.origin === location.origin) && /\/Advanced\.aspx$/i.test(location.pathname)) {
    const collect = () => {
      panel?.reload().catch(error => panel?.setStatus(error.message));
      pullData('incremental', text => panel?.setStatus(text))
        .then(() => panel?.reload())
        .catch(error => { console.warn('[SVKO Trading Statistics]', error.message); panel?.setStatus(error.message); });
    };
    const start = () => {
      if (brokerAccount()) { collect(); return; }
      const flag = document.getElementById('divAccountFlag');
      if (!flag) return;
      // The broker fills its account label asynchronously. Watch only that label until it is ready.
      const observer = new MutationObserver(() => {
        if (brokerAccount()) { observer.disconnect(); clearTimeout(expiry); collect(); }
      });
      observer.observe(flag, { childList: true, characterData: true, subtree: true });
      const expiry = setTimeout(() => observer.disconnect(), 30000);
    };
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
  }
})();
