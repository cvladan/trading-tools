// ==UserScript==
// @name         SVKO TradingView Alerts Custom Sounds
// @namespace    cvladan.com
// @version      0.1.0
// @description  Choose locally stored custom sounds for TradingView alert toasts.
// @author       cvladan
// @icon         https://static.tradingview.com/static/images/favicon.ico
// @match        https://www.tradingview.com/chart/*
// @noframes
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
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

  const PREFIX = 'svko-tv-sounds:v1:sound:';
  const NAME = /^[a-z]+(?:-[a-z]+)*$/;
  const FILE_LIMIT = 5 * 1024 * 1024;
  const LIBRARY_LIMIT = 50 * 1024 * 1024;
  const MAIN = '[data-qa-id="alerts-create-edit-dialog"]';
  const NOTIFICATIONS = '[data-qa-id="alerts-notifications-edit-dialog"]';
  const MESSAGE = '[data-qa-id="alerts-message-edit-dialog"]';
  const EDITORS = `${MAIN}, ${NOTIFICATIONS}, ${MESSAGE}`;
  const own = '[data-svko-sounds]';
  let root, log, host, notificationView, selection, hint, library, notice;
  let seen = new WeakMap();
  let draftMessage = '';
  let pending = null;
  let operation = null;
  let startupTimer;
  let changingCheckboxes = false;
  const activeAudio = new Set();
  const observer = new MutationObserver(changed);

  function node(tag, text, props = {}) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    Object.assign(element, props);
    return element;
  }

  function button(text, action) {
    const element = node('button', text, { type: 'button' });
    element.addEventListener('click', action);
    return element;
  }

  function style() {
    if (document.getElementById('svko-sounds-style')) return;
    const element = node('style', `
      [data-svko-sounds]{font:14px/1.45 -apple-system,BlinkMacSystemFont,Arial,sans-serif;color:inherit;box-sizing:border-box}
      [data-svko-sounds] *{box-sizing:border-box}
      [data-svko-sounds] button,[data-svko-sounds] select,[data-svko-sounds] input{font:inherit;color:inherit;background:transparent;border:1px solid #787b8666;border-radius:6px;padding:7px 10px;min-height:32px}
      [data-svko-sounds] button{cursor:pointer} [data-svko-sounds] button:hover{background:#787b861f}
      [data-svko-sounds] button:disabled{opacity:.5;cursor:default}
      [data-svko-sounds] :focus-visible{outline:2px solid #2962ff;outline-offset:2px}
      [data-svko-sounds] select option{color:CanvasText;background:Canvas}
      .svko-sounds-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .svko-sounds-hint{font-size:12px;opacity:.75;margin:6px 0;white-space:pre-wrap}
      .svko-sounds-error{color:#ef5350;white-space:pre-wrap}
      #svko-sounds-library{width:min(560px,calc(100vw - 32px));max-height:85vh;overflow:auto;border:1px solid #787b8666;border-radius:12px;padding:22px;background:#fff;color:#131722;color-scheme:light}
      .theme-dark #svko-sounds-library{background:#1e222d;color:#d1d4dc;color-scheme:dark}
      #svko-sounds-library::backdrop{background:#0006}
      #svko-sounds-library h2{font-size:18px;margin:0 0 18px} #svko-sounds-library h3{font-size:15px;margin:16px 0 10px}
      #svko-sounds-library label{display:grid;gap:5px;margin:12px 0}
      #svko-sounds-library input{width:100%}
      .svko-sounds-item{padding:12px 0;border-bottom:1px solid #787b8633}
      .svko-sounds-item strong{flex:1;overflow-wrap:anywhere}
      #svko-sounds-notice{position:fixed;left:20px;bottom:24px;z-index:10000;max-width:min(430px,90vw);padding:14px;border:1px solid #787b86;border-radius:8px;background:#1e222d;color:#d1d4dc;box-shadow:0 4px 20px #0003}
    `, { id: 'svko-sounds-style' });
    document.head.append(element);
  }

  function report(message) {
    style();
    if (!notice?.isConnected) {
      notice = node('div', undefined, { id: 'svko-sounds-notice' });
      notice.dataset.svkoSounds = '';
      notice.setAttribute('role', 'status');
      document.body.append(notice);
    }
    notice.replaceChildren(node('strong', 'Custom sounds'), node('p', message),
      button('Manage sounds…', () => openLibrary()), button('Dismiss', () => notice.remove()));
  }

  function soundName(message) {
    const tags = Array.from(message.matchAll(/\[sound:([^\]]*)\]/g));
    if (!tags.length) {
      if (message.includes('[sound:')) throw new Error('Incomplete sound tag. Use [sound:name].');
      return '';
    }
    if (tags.length !== 1 || message.split('[sound:').length !== 2) throw new Error('Use one [sound:name] tag per alert.');
    if (!NAME.test(tags[0][1])) throw new Error('Sound names use lowercase letters and single hyphens between words.');
    return tags[0][1];
  }

  function withSound(message, name) {
    let used = false;
    const text = message.replace(/\[sound:[^\]]*\]/g, () => {
      if (!name || used) return '';
      used = true;
      return `[sound:${name}]`;
    });
    return name && !used ? `${text}${text && !/\s$/.test(text) ? ' ' : ''}[sound:${name}]` : text;
  }

  function names() {
    return GM_listValues().filter(key => key.startsWith(PREFIX) && NAME.test(key.slice(PREFIX.length)))
      .map(key => key.slice(PREFIX.length)).sort();
  }

  function recording(name) {
    const value = GM_getValue(PREFIX + name, null);
    if (!value) throw new Error(`Missing sound: ${name}. Add it in Manage sounds.`);
    if (value.schemaVersion !== 1 || value.name !== name || typeof value.dataUri !== 'string' ||
        !/^data:[^,]*;base64,/.test(value.dataUri) || !Number.isFinite(value.byteLength) || value.byteLength <= 0) {
      throw new Error(`Invalid recording: ${name}. Replace its audio in Manage sounds.`);
    }
    return value;
  }

  function play(dataUri, onError = report, onEnded) {
    const audio = new Audio(dataUri);
    activeAudio.add(audio);
    const release = () => {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      activeAudio.delete(audio);
    };
    const fail = error => {
      release();
      onError(error?.name === 'NotAllowedError'
        ? 'Audio was blocked. Open Manage sounds and use Preview to enable playback in this tab.'
        : 'Audio could not be played. Preview or replace the recording.');
    };
    audio.onended = () => { release(); onEnded?.(); };
    audio.onerror = fail;
    try { Promise.resolve(audio.play()).catch(fail); } catch (error) { fail(error); }
    return release;
  }

  function read(item) {
    const message = item.querySelector('[class^="description-"], [class*=" description-"]')?.textContent.trim();
    const time = item.querySelector('[class^="time-"], [class*=" time-"]')?.textContent.trim();
    return message && time ? { message, signature: JSON.stringify([message, time]) } : null;
  }

  function scan() {
    for (const item of log.querySelectorAll('ul > li')) {
      const alert = read(item);
      if (!alert) continue;
      const previous = seen.get(item);
      seen.set(item, alert.signature);
      // A toast already present but incomplete at Start is still part of the baseline.
      if (previous === null || previous === alert.signature) continue;
      try {
        const name = soundName(alert.message);
        if (name) play(recording(name).dataUri);
      } catch (error) { report(error.message); }
    }
  }

  function attachLog() {
    if (log?.isConnected) return;
    const control = document.querySelector('[data-name="toast-group-expand-button-alerts"]');
    const list = document.getElementById(control?.getAttribute('aria-controls') || '');
    log = list?.tagName === 'UL' ? list.closest('[role="log"]') : null;
    seen = new WeakMap();
    if (log) for (const item of log.querySelectorAll('ul > li')) seen.set(item, read(item)?.signature ?? null);
  }

  function watch() {
    observer.disconnect();
    if (root?.isConnected) {
      observer.observe(root, { childList: true });
      // Popup shells are inserted before their editor content. Exclude the toast/chart branch.
      for (const branch of root.children) {
        if (branch.getAttribute('data-id') !== 'chart-toasts-container') {
          observer.observe(branch, { childList: true, subtree: true, characterData: true });
        }
      }
    }
    if (log?.isConnected) observer.observe(log, { childList: true, subtree: true, characterData: true });

    if ((!root || !log) && startupTimer) observer.observe(document.body, { childList: true, subtree: true });
  }

  function findHost() {
    const editor = root?.querySelector(EDITORS);
    let next = editor;
    while (next && next.parentElement !== root) next = next.parentElement;
    if (next === host) return false;
    if (host) { host.removeEventListener('click', editorClick, true); host.removeEventListener('change', editorChange); }
    cancelOperation();
    host = next;
    notificationView = null;
    pending = null;
    draftMessage = '';
    if (host) { host.addEventListener('click', editorClick, true); host.addEventListener('change', editorChange); }
    return true;
  }

  function changed(records) {
    const external = records.filter(r => !((r.target.nodeType === 1 ? r.target : r.target.parentElement)?.closest(own)));
    if (!external.length) return;
    const structure = !root || !log || !log.isConnected || external.some(r => r.target === root);
    if (structure) {
      root = document.getElementById('overlap-manager-root');
      attachLog();
      findHost();
      watch();
    }
    if (log && external.some(r => log.contains(r.target))) scan();
    if (!structure && findHost()) watch();
    if (host && (structure || external.some(r => host.contains(r.target)))) syncEditor();
    if (root && log && startupTimer) { clearTimeout(startupTimer); startupTimer = null; watch(); }
  }

  function start() {
    clearTimeout(startupTimer);
    root = document.getElementById('overlap-manager-root');
    attachLog();
    findHost();
    if (!root || !log) startupTimer = setTimeout(() => {
      startupTimer = null;
      watch();
      if (!log) report('Alert container unavailable. Use Retry detection in Manage sounds after the chart has loaded.');
    }, 10000);
    else startupTimer = null;
    watch();
    syncEditor();
  }

  function check(kind) { return notificationView?.querySelector(`[data-qa-id="${kind}"] input[type="checkbox"]`); }

  function updateHint() {
    if (!hint?.isConnected) return;
    const name = selection.value;
    hint.textContent = name && name !== '__add' && !check('show-popup')?.checked
      ? 'Custom sound requires Show toast notification.'
      : 'Applied to the message when you choose Apply. The alert is saved separately.';
  }

  function fillSelection(value) {
    selection.replaceChildren(node('option', 'None', { value: '' }));
    const available = names();
    for (const name of available) selection.append(node('option', name, { value: name }));
    if (value && !available.includes(value)) selection.append(node('option', `Missing sound: ${value}`, { value }));
    selection.append(node('option', 'Add sound…', { value: '__add' }));
    selection.value = value;
    updateHint();
  }

  function choose(name) {
    if (!notificationView?.isConnected) return;
    if (name) recording(name);
    pending = name;
    fillSelection(name);
    if (name) {
      changingCheckboxes = true;
      try {
        if (!check('show-popup')?.checked) check('show-popup')?.click();
        if (check('play-sound')?.checked) check('play-sound')?.click();
      } finally { changingCheckboxes = false; }
    }
    updateHint();
  }

  function summaryMessage(main) {
    const control = main.querySelector('[data-qa-id="alert-message-button"]');
    const html = control?.getAttribute('data-overflow-tooltip-html');
    if (html == null) return control?.textContent || '';
    // TradingView prefixes named alerts with <b>name</b><br> in the tooltip.
    // Template contents stay inert and are never inserted into the page.
    const template = document.createElement('template');
    template.innerHTML = html;
    const title = template.content.firstElementChild;
    if (title?.tagName === 'B' && title.nextSibling?.nodeName === 'BR') {
      title.nextSibling.remove(); title.remove();
    }
    return template.content.textContent;
  }

  function syncEditor() {
    if (!host) return;
    if (!host.querySelector(NOTIFICATIONS)) host.querySelector('[data-svko-sounds="choice"]')?.remove();
    if (operation) { advanceOperation(); return; }
    const main = host.querySelector(MAIN);
    if (main) {
      draftMessage = summaryMessage(main);
      notificationView = null;
      return;
    }
    const view = host.querySelector(NOTIFICATIONS);
    if (!view) return;
    if (notificationView !== view) { notificationView = view; pending = null; }
    if (view.querySelector('[data-svko-sounds="choice"]')) return;
    const native = view.querySelector('[data-qa-id="sound-title-select"]');
    const anchor = native?.parentElement?.parentElement;
    if (!anchor) return;
    style();
    const row = node('div');
    row.dataset.svkoSounds = 'choice';
    row.style.cssText = 'margin:14px 0 18px;';
    const line = node('div', undefined, { className: 'svko-sounds-row' });
    const label = node('label', 'Custom sound', { htmlFor: 'svko-sounds-choice' });
    selection = node('select', undefined, { id: 'svko-sounds-choice' });
    hint = node('p', undefined, { className: 'svko-sounds-hint' });
    let selected = '';
    try { selected = pending ?? soundName(draftMessage); } catch (error) { report(error.message); }
    line.append(label, selection, button('Manage sounds…', () => openLibrary()));
    row.append(line, hint);
    anchor.after(row);
    try { fillSelection(selected); } catch (error) { hint.textContent = error.message; }
    selection.addEventListener('change', () => {
      const name = selection.value;
      if (name === '__add') {
        fillSelection(pending ?? selected);
        openLibrary(true, choose);
      } else {
        try { choose(name); } catch (error) { report(error.message); fillSelection(pending ?? selected); }
      }
    });
  }

  function editorChange(event) {
    if (!notificationView || changingCheckboxes || event.target.closest(own)) return;
    if (event.target === check('play-sound') && event.target.checked && selection?.value) choose('');
    updateHint();
  }

  function editorClick(event) {
    const target = event.target.closest('button');
    if (!target || target.closest(own)) return;
    const view = target.closest(NOTIFICATIONS);
    const qa = target.getAttribute('data-qa-id');
    if (operation && target.closest(MAIN) && qa === 'submit') {
      event.preventDefault(); event.stopImmediatePropagation();
      report('Finish applying the custom sound before saving the alert.');
      return;
    }
    if (!view) return;
    if (qa === 'cancel' || qa === 'back' || qa === 'close') pending = null;
    if (qa !== 'submit' || pending === null) return;
    try { if (pending) recording(pending); }
    catch (error) { event.preventDefault(); event.stopImmediatePropagation(); report(error.message); return; }
    operation = { name: pending, stage: 'main', host, timer: setTimeout(() => {
      cancelOperation(); report('Could not apply the sound tag. Check the alert message before saving.');
    }, 5000) };
    pending = null;
  }

  function cancelOperation() {
    if (operation) clearTimeout(operation.timer);
    operation = null;
  }

  function advanceOperation() {
    const task = operation;
    if (!task || task.host !== host) return;
    const main = host.querySelector(MAIN);
    const message = host.querySelector(MESSAGE);
    if (task.stage === 'main' && main) {
      task.stage = 'message';
      main.querySelector('[data-qa-id="alert-message-button"]')?.click();
    } else if (task.stage === 'message' && message) {
      const input = message.querySelector('textarea#alert-message');
      if (!input) return;
      task.expected = withSound(input.value, task.name);
      try { soundName(task.expected); }
      catch (error) { cancelOperation(); report(error.message + ' Correct the message before saving.'); return; }
      task.stage = 'verify';
      // Use the native setter so the controlled field receives a real input change.
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, task.expected);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      queueMicrotask(() => {
        if (operation === task && message.isConnected) message.querySelector('[data-qa-id="submit"]')?.click();
      });
    } else if (task.stage === 'verify' && main) {
      const actual = summaryMessage(main);
      cancelOperation();
      draftMessage = actual;
      notificationView = null;
      if (actual !== task.expected) report('The message change was not accepted. Open Message and check the sound tag before saving.');
    }
  }

  function validateAudio(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.size) { reject(new Error('Choose a nonempty audio file.')); return; }
      if (file.size > FILE_LIMIT) { reject(new Error('Each recording must be at most 5 MiB.')); return; }
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      const finish = error => {
        clearTimeout(timer);
        audio.onloadeddata = null; audio.onerror = null;
        audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url);
        error ? reject(error) : resolve();
      };
      const timer = setTimeout(() => finish(new Error('Audio validation timed out. Try another recording.')), 10000);
      audio.onloadeddata = () => finish();
      audio.onerror = () => finish(new Error('This file cannot be decoded as audio by the browser.'));
      audio.preload = 'auto'; audio.src = url; audio.load();
    });
  }

  function dataUri(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('The audio file could not be read.'));
      reader.readAsDataURL(file);
    });
  }

  function openLibrary(add = false, onAdded = null) {
    if (library?.isConnected) { library.focus(); return; }
    style();
    const previousFocus = document.activeElement;
    const dialog = node('dialog', undefined, { id: 'svko-sounds-library' });
    library = dialog;
    dialog.dataset.svkoSounds = 'library';
    dialog.setAttribute('aria-labelledby', 'svko-sounds-heading');
    const title = node('h2', 'Custom sounds', { id: 'svko-sounds-heading' });
    const content = node('div');
    const error = node('p', undefined, { className: 'svko-sounds-error' });
    error.setAttribute('role', 'status');
    let stopPreview;
    let editing = 0;
    const setError = text => {
      error.textContent = text;
      error.className = /^(Preview |Checking audio|Alert detection is connected)/.test(text) ? 'svko-sounds-hint' : 'svko-sounds-error';
    };
    const close = () => {
      editing++; stopPreview?.(); dialog.close(); dialog.remove(); library = null;
      if (previousFocus?.isConnected) previousFocus.focus();
      if (notificationView?.isConnected && selection?.isConnected) {
        try { fillSelection(selection.value); } catch (failure) { report(failure.message); }
      }
    };
    const closeButton = button('Close', close);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.append(title, content, error, closeButton);
    // A native modal keeps keyboard focus inside the library above the TradingView popup.
    document.body.append(dialog);
    dialog.showModal();

    const preview = value => {
      stopPreview?.(); setError('Preview playing…');
      stopPreview = play(value, setError, () => setError('Preview finished.'));
    };
    function list() {
      editing++; setError(''); content.replaceChildren();
      let available;
      try { available = names(); } catch { setError('The sound library could not be read.'); return; }
      if (!available.length) content.append(node('p', 'No custom sounds yet. Add a recording to use it in an alert.'));
      for (const name of available) {
        const item = node('div', undefined, { className: 'svko-sounds-item' });
        const line = node('div', undefined, { className: 'svko-sounds-row' });
        const entry = GM_getValue(PREFIX + name, null);
        line.append(node('strong', name), node('small', `${((entry?.byteLength || 0) / 1024).toFixed(1)} KiB`));
        const actions = node('div', undefined, { className: 'svko-sounds-row' });
        actions.append(button('Preview', () => {
          try { preview(recording(name).dataUri); } catch (failure) { setError(failure.message); }
        }), button('Replace audio…', () => edit(name)), button('Delete', () => {
          const question = node('p', `Delete ${name}? Alerts using [sound:${name}] will have no custom sound.`);
          const yes = button('Delete recording', () => {
            try { GM_deleteValue(PREFIX + name); list(); } catch { setError('The recording could not be deleted.'); }
          });
          actions.replaceChildren(question, yes, button('Cancel', list));
        }));
        item.append(line, actions); content.append(item);
      }
      const footer = node('div', undefined, { className: 'svko-sounds-row' });
      footer.style.marginTop = '16px';
      footer.append(button('Add sound…', () => edit()), button('Retry detection', () => {
        start(); setError(log ? 'Alert detection is connected.' : 'Alert container is not available yet.');
      }));
      content.append(footer);
    }

    function edit(existing = '') {
      const revision = ++editing; setError(''); stopPreview?.(); content.replaceChildren();
      const name = node('input', undefined, { value: existing, readOnly: !!existing, required: true });
      name.setAttribute('aria-label', 'Sound name');
      name.placeholder = 'soft-bell';
      name.pattern = '[a-z]+(?:-[a-z]+)*';
      const file = node('input', undefined, { type: 'file', accept: 'audio/*' });
      file.setAttribute('aria-label', 'Audio file');
      const nameLabel = node('label', 'Name'); nameLabel.append(name);
      const fileLabel = node('label', 'Audio file'); fileLabel.append(file);
      const help = node('p', 'Lowercase letters with single hyphens between words. Names stay fixed when replacing audio. Maximum 5 MiB per file.', { className: 'svko-sounds-hint' });
      file.addEventListener('change', () => {
        if (!name.value && file.files[0]) name.value = file.files[0].name.replace(/\.[^.]+$/, '').toLowerCase()
          .replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
      });
      const actions = node('div', undefined, { className: 'svko-sounds-row' });
      const previewButton = button('Preview', async () => {
        try {
          setError(''); const chosen = file.files[0]; await validateAudio(chosen);
          const encoded = await dataUri(chosen);
          if (dialog.isConnected && editing === revision) preview(encoded);
        } catch (failure) { if (editing === revision) setError(failure.message); }
      });
      const save = button('Save', async () => {
        const chosen = file.files[0];
        const chosenName = name.value;
        if (!NAME.test(chosenName)) { setError('Use lowercase letters and single hyphens between words.'); name.focus(); return; }
        if (!existing && GM_getValue(PREFIX + chosenName, null)) { setError('That name already exists. Use Replace audio instead.'); return; }
        save.disabled = true; previewButton.disabled = true; setError('Checking audio…');
        try {
          await validateAudio(chosen);
          const encoded = await dataUri(chosen);
          if (!dialog.isConnected || editing !== revision) return;
          if (!existing && GM_getValue(PREFIX + chosenName, null)) throw new Error('That name was added in another tab. Choose another name.');
          let total = chosen.size;
          for (const key of names()) if (key !== chosenName) total += GM_getValue(PREFIX + key, {})?.byteLength || 0;
          if (total > LIBRARY_LIMIT) throw new Error('The library limit is 50 MiB. Delete an unused recording first.');
          const value = { schemaVersion: 1, name: chosenName, mimeType: chosen.type || 'application/octet-stream', byteLength: chosen.size, dataUri: encoded, updatedAt: Date.now() };
          await GM_setValue(PREFIX + chosenName, value);
          const saved = recording(chosenName);
          if (saved.dataUri !== encoded) throw new Error('The recording could not be verified after saving.');
          if (onAdded && !existing) { close(); onAdded(chosenName); }
          else list();
        } catch (failure) { if (editing === revision) setError(failure.message || 'The recording could not be saved.'); }
        finally { save.disabled = false; previewButton.disabled = false; }
      });
      actions.append(previewButton, save, button('Cancel', list));
      content.append(node('h3', existing ? `Replace ${existing}` : 'Add sound'), nameLabel, fileLabel, help, actions);
      name.focus();
    }
    if (add) edit(); else list();
  }

  GM_registerMenuCommand('Manage custom sounds', () => openLibrary());
  window.addEventListener('pagehide', () => {
    observer.disconnect(); clearTimeout(startupTimer); cancelOperation();
    for (const audio of activeAudio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    activeAudio.clear();
  });
  window.addEventListener('pageshow', event => { if (event.persisted) start(); });
  start();
})();
