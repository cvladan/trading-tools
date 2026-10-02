// ==UserScript==
// @name         SVKO TradingView Alert Speech
// @namespace    cvladan.com
// @version      0.2.0
// @description  Speak TradingView alert messages and retain generated recordings locally.
// @author       cvladan
// @icon         https://static.tradingview.com/static/images/favicon.ico
// @match        https://www.tradingview.com/chart/*
// @noframes
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_xmlhttpRequest
// @connect      openrouter.ai
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

  let observer;
  let log;
  let panel;
  let status;
  let enableAudio;
  let settingsDialog;
  let session;
  let seen = new WeakMap();
  let count = 0;
  let lastAlert;
  const PREFIX = 'svko-alert-speech:';
  const MODEL = 'google/gemini-3.8-flash-tts';


  function show(text) {
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'svko-alert-speech-status';
      panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:10000;max-width:min(360px,calc(100vw - 32px));max-height:40vh;overflow:auto;box-sizing:border-box;padding:12px 16px;border:1px solid #4c9aff;border-radius:6px;background:#131722;color:#fff;font:13px/1.5 sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;';
      status = document.createElement('div');
      status.setAttribute('role', 'status');
      enableAudio = document.createElement('button');
      enableAudio.textContent = 'Enable audio';
      enableAudio.style.cssText = 'margin-top:8px;padding:6px 12px;cursor:pointer;';
      enableAudio.onclick = async () => {
        const active = session;
        if (!active || active.error) return;
        try {
          active.audio ??= new AudioContext();
          await active.audio.resume();
          if (active !== session) return;
          if (active.audio.state !== 'running') throw new Error('Audio could not start.');
          active.notice = 'Audio enabled.';
          render();
          pump(active);
        } catch {
          if (active === session) { active.notice = 'Audio could not start. Click Enable audio to retry.'; render(); }
        }
      };
      panel.append(status, enableAudio);
      document.body.append(panel);
    }
    status.textContent = text;
    enableAudio.hidden = !session?.audio || !!session.error || session.audio.state === 'running';
  }

  function render() {
    if (!session) return;
    show(`SVKO Alert Speech\nListening · Detected: ${count}\n${lastAlert ? `${lastAlert.message}\n${lastAlert.time}` : 'Waiting for a new alert.'}\n${session.error ? `Speech paused: ${session.error}\nCheck Speech settings or reload the chart to retry.` : session.notice}`);
  }

  function language(code) {
    try { return Intl.getCanonicalLocales(code.trim())[0] || 'en'; }
    catch { throw new Error('Invalid language code. Use a tag such as [say:sr] or [say:en].'); }
  }

  function phrase(message, defaultLanguage) {
    let selected;
    const text = message.replace(/\[say(?::([^\]]*))?\]/gi, (_, code) => {
      if (code === undefined) code = defaultLanguage;
      if (!code.trim()) throw new Error('The [say:] language code is empty.');
      const next = language(code);
      if (selected && next !== selected) throw new Error('Use one language per alert message.');
      selected = next;
      return ' ';
    }).replace(/\s+/g, ' ').trim();
    if (!text) throw new Error('The alert has no text to speak.');
    return { text, language: selected || language(defaultLanguage) };
  }

  function requestAudio(active, body, format) {
    return new Promise((resolve, reject) => {
      active.request = GM_xmlhttpRequest({
        method: 'POST', url: 'https://openrouter.ai/api/v1/audio/speech',
        anonymous: true, responseType: 'arraybuffer', timeout: 60000,
        headers: { Authorization: `Bearer ${active.config.apiKey}`, 'Content-Type': 'application/json' },
        data: body,
        onload(response) {
          active.request = null;
          if (response.status !== 200) {
            let detail = '';
            try {
              detail = typeof response.response === 'string' ? response.response : new TextDecoder().decode(response.response);
              try { detail = JSON.stringify(JSON.parse(detail), null, 2); } catch {}
            } catch {}
            detail = detail.split(active.config.apiKey).join('[redacted]').replace(/sk-or-[\w-]+/g, '[redacted]');
            reject(new Error(`OpenRouter HTTP ${response.status}${detail ? ': ' + detail : '. The speech request failed.'}`)); return;
          }
          if (!(format === 'pcm' ? /^content-type:\s*audio\/pcm\b/im : /^content-type:\s*audio\//im).test(response.responseHeaders || '')) {
            reject(new Error('OpenRouter returned an unexpected audio format. No recording was saved.')); return;
          }
          const bytes = response.response;
          if (!bytes?.byteLength || bytes.byteLength > 10 * 1024 * 1024) {
            reject(new Error('The audio response is empty or exceeds 10 MiB.')); return;
          }
          resolve(bytes);
        },
        onerror() { active.request = null; reject(new Error('OpenRouter could not be reached.')); },
        ontimeout() { active.request = null; reject(new Error('OpenRouter did not respond within 60 seconds.')); },
        onabort() { active.request = null; reject(new Error('Speech request cancelled.')); },
      });
    });
  }

  function decodeAudio(active, bytes, format) {
    if (format !== 'pcm') return active.audio.decodeAudioData(bytes);
    if (!bytes.byteLength || bytes.byteLength % 2) throw new Error('The PCM recording is incomplete.');
    // Gemini TTS returns mono, signed 16-bit little-endian PCM at 24 kHz.
    const samples = new DataView(bytes);
    const buffer = active.audio.createBuffer(1, bytes.byteLength / 2, 24000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < channel.length; i++) channel[i] = samples.getInt16(i * 2, true) / 32768;
    return buffer;
  }

  function defaultParameters(config) {
    const google = (config.model || MODEL).startsWith('google/');
    const voice = config.voice || (google ? 'Kore' : '');
    const parameters = {
      ...(voice ? { voice } : {}),
      response_format: config.format && config.format !== 'auto' ? config.format : google ? 'pcm' : 'mp3',
    };
    if (google) parameters.provider = { only: ['google-ai-studio'], options: { 'google-ai-studio': {
      speechConfig: { voiceConfig: { voice }, languageCode: '{{locale}}' },
      speech_metadata: { style: 'Clear, calm delivery.' },
    } } };
    return parameters;
  }

  function buildRequest(config, spoken) {
    const parameters = Object.hasOwn(config, 'requestParameters') ? config.requestParameters : defaultParameters(config);
    if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) throw new Error('Request parameters must be a JSON object.');
    if (Object.hasOwn(parameters, 'model') || Object.hasOwn(parameters, 'input')) throw new Error('Remove model and input from the JSON. They come from the model field and alert or test message.');
    const region = new Intl.Locale(spoken.language).maximize().region;
    const locale = spoken.language.includes('-') || !region ? spoken.language : `${spoken.language}-${region}`;
    const resolved = JSON.parse(JSON.stringify(parameters), (_, value) => typeof value === 'string'
      ? value.replace(/\{\{(language|locale)\}\}/g, (_, token) => token === 'language' ? spoken.language : locale) : value);
    return { model: config.model, input: spoken.text, ...resolved };
  }

  async function recording(active, spoken) {
    const request = buildRequest(active.config, spoken);
    const format = request.response_format || 'pcm';
    const body = JSON.stringify(request);
    const identity = JSON.stringify([spoken.language, request]);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
    const key = PREFIX + 'audio:v1:' + Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    const saved = await GM.getValue(key, null);
    if (active !== session) return null;
    if (saved) {
      if (saved.request !== body || typeof saved.audio !== 'string') throw new Error('The saved recording is invalid.');
      active.recordingSource = 'Used a saved recording.';
      active.notice = 'Playing saved recording.'; render();
      const bytes = Uint8Array.from(atob(saved.audio), char => char.charCodeAt(0));
      return decodeAudio(active, bytes.buffer, format);
    }
    active.notice = 'Generating speech…'; render();
    const bytes = await requestAudio(active, body, format);
    if (active !== session) return null;
    const decoded = await decodeAudio(active, bytes.slice(0), format);
    let binary = '';
    const values = new Uint8Array(bytes);
    for (let offset = 0; offset < values.length; offset += 8192) binary += String.fromCharCode(...values.subarray(offset, offset + 8192));
    try { await GM.setValue(key, { request: body, audio: btoa(binary) }); }
    catch { throw new Error('The recording could not be saved. Speech is paused to avoid repeated generation.'); }
    active.recordingSource = 'Generated and saved a new recording.';
    return decoded;
  }

  function play(active, buffer) {
    return new Promise((resolve, reject) => {
      const source = active.audio.createBufferSource();
      active.source = source;
      source.buffer = buffer;
      source.connect(active.audio.destination);
      const finish = error => { source.disconnect(); active.source = null; active.finishPlayback = null; error instanceof Error ? reject(error) : resolve(); };
      active.finishPlayback = finish;
      source.onended = finish;
      try { source.start(); }
      catch { finish(new Error('The recording could not be played.')); }
    });
  }

  async function pump(active) {
    if (active !== session || active.busy || active.error || !active.config || !active.queue.length) return;
    if (!active.config.apiKey) {
      active.queue.length = 0;
      active.notice = 'Add your OpenRouter API key in Speech settings.'; render(); return;
    }
    if (!active.audio) {
      try {
        active.audio = new AudioContext();
        active.audio.resume().then(() => { if (active === session && active.audio.state === 'running') pump(active); }).catch(() => {
          if (active === session) { active.notice = 'Click Enable audio to allow playback.'; render(); }
        });
      } catch { active.error = 'Browser audio could not be initialised.'; render(); return; }
    }
    if (active.audio?.state !== 'running') {
      active.notice = 'Click Enable audio to hear queued alerts.'; render(); return;
    }
    active.busy = true;
    try {
      while (active === session && active.queue.length) {
        const spoken = phrase(active.queue.shift().message, active.config.language);
        const buffer = await recording(active, spoken);
        if (active !== session) break;
        active.notice = `Speaking: ${spoken.text}`; render();
        await play(active, buffer);
      }
      active.notice = 'Audio enabled. Waiting for a new alert.';
    } catch (error) {
      active.error = error.message || 'Speech failed.';
      active.queue.length = 0;
    } finally {
      active.busy = false;
      if (active === session) render();
    }
  }

  async function configure() {
    if (settingsDialog) return;
    settingsDialog = document.createElement('dialog');
    const dialog = settingsDialog;
    dialog.style.cssText = 'padding:0;border:1px solid #555;border-radius:8px;max-width:640px;width:calc(100vw - 40px);';
    const frame = document.createElement('iframe');
    frame.title = 'Alert Speech settings';
    frame.style.cssText = 'display:block;border:0;width:100%;height:1px;max-height:90vh;';
    dialog.append(frame);
    document.body.append(dialog);
    dialog.showModal();
    // A separate document keeps TradingView keyboard shortcuts away from password paste.
    const root = frame.contentDocument;
    root.body.innerHTML = `<style>
      :root{color-scheme:dark}body{margin:0;color:#eee;background:#131722;font:14px/1.5 sans-serif}form{padding:20px}
      label{display:block;margin:12px 0}input,textarea{box-sizing:border-box;width:100%;padding:8px;background:#1e222d;color:#eee;border:1px solid #505665;border-radius:4px}input::placeholder,textarea::placeholder{color:#a3a9b7}
      textarea{font:12px/1.5 monospace;resize:vertical;tab-size:2}button{padding:7px 14px;margin-right:8px;background:#2a2e39;color:#eee;border:1px solid #505665;border-radius:4px;cursor:pointer}button:hover:not(:disabled){background:#363c4a}button:disabled{opacity:.5;cursor:default}input:focus-visible,textarea:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid #4c9aff;outline-offset:2px}
      p{font-size:12px}h2{margin:0}form>details{border:1px solid #444;border-radius:5px;margin:16px 0;padding:8px 12px}
      #feedback,#json-error{white-space:pre-wrap;overflow-wrap:anywhere}#json-error{color:#ffb4b4}
      .key-field{position:relative;display:block}.key-field input{padding-right:70px}
      .key-field button{position:absolute;right:3px;top:3px;margin:0;padding:5px 8px}
      summary{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}
    </style><form><h2>Alert Speech settings</h2>
      <label>OpenRouter API key<span class="key-field"><input name="key" type="password" autocomplete="off" placeholder="Enter your OpenRouter API key"><button type="button" id="toggle-key" aria-label="Show API key" aria-pressed="false">Show</button></span></label>
      <details class="speech-section" open><summary>Speech</summary><label>Model slug<input name="model" required spellcheck="false"></label>
      <label>Default language<input name="language" value="en" required></label>
      <p>Put [say] anywhere in an alert for the default language, or [say:sr], [say:en] or another code for an explicit language. The tag is removed before speech. Text is not translated.</p></details>
      <details class="request-json"><summary>Request JSON</summary><label>Request parameters<textarea name="parameters" rows="14" spellcheck="false"></textarea></label>
      <p>Edit voice, response_format, provider and any other request options here. Model and input always come from the fields above and the alert or test message. Do not add them to this JSON.</p>
      <p>Use {{language}} for the alert language, such as sr, or {{locale}} for its regional code, such as sr-RS, inside any JSON string. Without a placeholder, language tags do not change these parameters.</p>
      <button type="button" id="defaults">Load model defaults</button><p>Changing the model keeps your JSON. Load defaults to replace it with a starting point for that model. Other providers may require their own voice and language options.</p>
      <p>PCM playback expects 24 kHz, 16 bit mono audio. Other audio formats use the browser decoder. The selected model must support the requested format.</p>
      <p id="json-error" role="status"></p><details><summary>Request preview</summary><p>Exact request body for the test message. The API key is sent separately in the Authorization header.</p><pre id="request-preview"></pre></details></details>
      <details class="test-section"><summary>Test speech</summary><label>Test message<input name="testMessage" value="[say:en] Testing."></label>
      <button type="submit" id="test-speech">Test speech</button><p>Tests the current fields without saving settings. New recordings are saved locally and reused.</p><p id="feedback" role="status"></p></details>
      <button type="submit">Save</button><button type="button" id="cancel">Cancel</button></form>`;

    const form = root.querySelector('form');
    const fitDialog = () => { frame.style.height = `${Math.ceil(form.getBoundingClientRect().height)}px`; };
    root.addEventListener('toggle', fitDialog, true);
    fitDialog();
    form.onsubmit = event => event.preventDefault();
    const feedback = root.querySelector('#feedback');
    const toggleKey = root.querySelector('#toggle-key');
    toggleKey.onclick = () => {
      const reveal = form.elements.key.type === 'password';
      form.elements.key.type = reveal ? 'text' : 'password';
      toggleKey.textContent = reveal ? 'Hide' : 'Show';
      toggleKey.setAttribute('aria-label', reveal ? 'Hide API key' : 'Show API key');
      toggleKey.setAttribute('aria-pressed', String(reveal));
    };
    form.elements.model.value = MODEL;
    const readConfig = () => {
      let requestParameters;
      try { requestParameters = JSON.parse(form.elements.parameters.value); }
      catch (error) { throw new Error(`Invalid request JSON: ${error.message}`); }
      return { apiKey: form.elements.key.value.trim() || saved?.apiKey || '', model: form.elements.model.value.trim(), language: language(form.elements.language.value), requestParameters };
    };
    const refreshPreview = () => {
      try {
        const config = readConfig();
        const request = buildRequest(config, phrase(form.elements.testMessage.value, config.language));
        root.querySelector('#request-preview').textContent = JSON.stringify(request, null, 2);
        root.querySelector('#json-error').textContent = '';
      } catch (error) {
        root.querySelector('#request-preview').textContent = '';
        root.querySelector('#json-error').textContent = error.message;
      }
      fitDialog();
    };
    form.addEventListener('input', event => { if (event.target.name !== 'key') refreshPreview(); });
    root.querySelector('#defaults').onclick = () => {
      form.elements.parameters.value = JSON.stringify(defaultParameters({ model: form.elements.model.value.trim() }), null, 2);
      refreshPreview();
    };
    let preview;
    const close = () => {
      if (preview && preview === session) { stop(); start(); }
      form.elements.key.value = ''; dialog.remove(); settingsDialog = null;
    };
    root.querySelector('#cancel').onclick = close;
    root.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); } });
    dialog.oncancel = event => { event.preventDefault(); close(); };
    let saved;
    try {
      saved = await GM.getValue(PREFIX + 'settings', {});
      if (!dialog.isConnected) return;
      form.elements.key.value = saved.apiKey || '';
      form.elements.model.value = saved.model || MODEL;
      form.elements.parameters.value = JSON.stringify(Object.hasOwn(saved, 'requestParameters') ? saved.requestParameters : defaultParameters(saved), null, 2);
      form.elements.language.value = saved.language || 'en';
      refreshPreview();
      feedback.textContent = saved.apiKey ? 'Your saved API key is loaded. Use Show API key to check it.' : 'Enter your OpenRouter API key to enable speech.';
      fitDialog();
    } catch { feedback.textContent = 'Settings could not be loaded. Close this dialog and retry.'; return; }
    form.onsubmit = async event => {
      event.preventDefault();
      let activeTest;
      const buttons = form.querySelectorAll('button[type=submit]');
      for (const button of buttons) button.disabled = true;
      try {
        const config = readConfig();
        if (!config.apiKey) throw new Error('Enter an OpenRouter API key.');
        if (!/^[^\s/]+\/[^\s]+$/.test(config.model)) throw new Error('Enter a model slug such as google/gemini-3.8-flash-tts.');
        buildRequest(config, { text: '', language: config.language });
        const testing = event.submitter?.id === 'test-speech';
        const message = form.elements.testMessage.value;
        if (testing) phrase(message, config.language);
        const audio = testing ? new AudioContext() : null;
        const resumed = audio?.resume();
        try { if (!testing) await GM.setValue(PREFIX + 'settings', config); }
        catch (error) { audio?.close().catch(() => {}); throw error; }
        stop();
        const ready = start(testing ? config : null);
        const active = session;
        if (!testing) { close(); return; }
        preview = activeTest = active;
        active.audio = audio;
        feedback.textContent = 'Testing speech…';
        fitDialog();
        await resumed;
        await ready;
        if (active !== session) return;
        active.queue.push({ message });
        await pump(active);
        feedback.textContent = active.error || (active.audio.state === 'running' ? `Test finished. ${active.recordingSource || ''}` : 'Browser audio was blocked. Try Test speech again.');
      } catch (error) {
        root.querySelector('.test-section').open = true;
        feedback.textContent = error.message || 'Speech settings could not be applied.';
      }
      finally {
        if (activeTest && activeTest === session) { stop(); start(); }
        preview = null;
        for (const button of buttons) button.disabled = false;
        fitDialog();
      }
    };
  }

  function read(item) {
    const message = item.querySelector('[class^="description-"], [class*=" description-"]')?.textContent.trim();
    const time = item.querySelector('[class^="time-"], [class*=" time-"]')?.textContent.trim();
    return message && time ? { message, time, signature: JSON.stringify([message, time]) } : null;
  }

  function scan() {
    for (const item of log.querySelectorAll('ul > li')) {
      const alert = read(item);
      if (!alert) continue;
      const previous = seen.get(item);
      seen.set(item, alert.signature);
      // A toast already present but incomplete at Start is still part of the baseline.
      if (previous === null || previous === alert.signature) continue;
      count += 1;
      lastAlert = alert;
      if (!session.error) {
        if (session.queue.length >= 100) {
          session.error = 'More than 100 alerts are waiting. The waiting queue was cleared.';
          session.queue.length = 0;
        } else session.queue.push(alert);
      }
      render();
    }
    pump(session);
  }

  function stop() {
    observer?.disconnect();
    const previous = session;
    session = null;
    if (previous) {
      previous.queue.length = 0;
      previous.request?.abort();
      if (previous.source) { previous.source.onended = null; previous.source.stop(); previous.finishPlayback(); }
      previous.audio?.close().catch(() => {});
    }
    log = null;
    seen = new WeakMap();
    count = 0;
    lastAlert = null;
    panel?.remove();
    panel = null;
  }

  function attachAlerts() {
    const button = document.querySelector('[data-name="toast-group-expand-button-alerts"]');
    const id = button?.getAttribute('aria-controls');
    const list = id ? document.getElementById(id) : null;
    log = list?.tagName === 'UL' ? list.closest('[role="log"]') : null;
    if (!log) return false;
    for (const item of log.querySelectorAll('ul > li')) seen.set(item, read(item)?.signature ?? null);
    observer.disconnect();
    observer.observe(log, { childList: true, subtree: true, characterData: true });
    return true;
  }

  function start(config) {
    if (session && !session.error && (!log || log.isConnected)) return;
    stop();
    const active = { queue: [], config: null, busy: false, error: '', notice: 'Loading speech settings…' };
    session = active;
    observer ??= new MutationObserver(() => {
      if (log) scan();
      else attachAlerts();
    });
    // Reuse the same observer during asynchronous chart startup, then narrow its scope.
    if (!attachAlerts()) observer.observe(document.body, { childList: true, subtree: true });
    render();
    return Promise.resolve(config || GM.getValue(PREFIX + 'settings', {})).then(saved => {
      if (active !== session) return;
      active.config = { ...saved, apiKey: saved.apiKey || '', model: saved.model || MODEL, language: saved.language || 'en' };
      active.notice = active.config.apiKey ? 'Speech enabled.' : 'Add your OpenRouter API key in Speech settings.';
      render();
      pump(active);
    }).catch(() => { if (active === session) { active.error = 'Settings could not be loaded.'; render(); } });
  }

  GM_registerMenuCommand('Speech settings', () => configure().catch(() => {
    settingsDialog?.remove();
    settingsDialog = null;
    show('SVKO Alert Speech\nSpeech settings could not be opened. Try again after reloading the chart.');
  }));
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', event => { if (event.persisted) start(); });
  start();
})();
