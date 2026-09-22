// ==UserScript==
// @name         SVKO TradingView AI
// @namespace    cvladan.com
// @version      0.2.6
// @description  Open saved AI questions for the current TradingView symbol.
// @author       cvladan
// @icon         https://static.tradingview.com/static/images/favicon.ico
// @match        https://www.tradingview.com/chart/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_openInTab
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

  const DEFAULTS = [
    'Why has TICKER stock moved right now? Is there a catalyst? Short answer with a source.',
    'What are the latest news and upcoming catalysts for TICKER?',
    'What are the key support and resistance levels for TICKER and why?',
    'What are the bull and bear cases for TICKER right now?',
  ];
  const SERVICES = [
    ['ChatGPT', 'https://chatgpt.com/?prompt=', '&hints=search'],
    ['Perplexity', 'https://www.perplexity.ai/search?q=', ''],
    ['Google AI', 'https://www.google.com/search?q=', '&udm=50'],
    ['Grok', 'https://grok.com/?q=', ''],
  ];

  function openQuestions(ticker) {
    if (document.getElementById('svko-ai')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'svko-ai';
    dialog.setAttribute('aria-label', 'AI questions for ' + ticker);
    dialog.innerHTML = `<style>
      #svko-ai { color-scheme:dark; background:#171b26; color:#e0e3eb; border:1px solid #434651; border-radius:10px; padding:20px; width:calc(65ch + 164px); max-width:calc(100vw - 32px); max-height:85vh; box-sizing:border-box; font:14px/1.5 system-ui; }
      #svko-ai::backdrop { background:#0006; }
      #svko-ai h2 { font:600 18px system-ui; margin:0 36px 6px 0; }
      #svko-ai p { margin:0 0 14px; }
      #svko-ai .row { display:flex; gap:6px; margin:8px 0; align-items:stretch; }
      #svko-ai button, #svko-ai .editor { font:inherit; color:inherit; background:#242938; border:1px solid #434651; border-radius:5px; padding:8px; box-sizing:border-box; }
      #svko-ai button { cursor:pointer; }
      #svko-ai button:hover { background:#303b53; }
      #svko-ai :focus-visible { outline:2px solid #90b4ff; outline-offset:2px; }
      #svko-ai .question, #svko-ai .editor { flex:1; min-width:0; width:65ch; text-align:left; white-space:nowrap; overflow-x:auto; overflow-y:hidden; }
      #svko-ai .question { position:relative; overflow:hidden; text-overflow:ellipsis; padding-right:56px; background:#29364c; border-color:#526b91; box-shadow:inset 0 1px #ffffff12; }
      #svko-ai .question:is(:hover, :focus-visible) { background:#354c70; border-color:#90b4ff; }
      #svko-ai .question::after { content:'Run'; position:absolute; right:0; top:0; bottom:0; width:48px; display:flex; align-items:center; justify-content:center; background:inherit; visibility:hidden; font-weight:600; }
      #svko-ai .question:is(:hover, :focus-visible)::after { visibility:visible; }
      #svko-ai .question:active { background:#233a5c; }
      #svko-ai .add { margin-top:4px; }
      #svko-ai .icon { width:36px; flex-shrink:0; font-size:20px; line-height:21px; }
      #svko-ai fieldset { display:flex; align-items:center; gap:16px; border:0; min-width:0; overflow-x:auto; white-space:nowrap; padding:0; margin:16px 0; }
      #svko-ai .close { position:absolute; top:10px; right:10px; padding:0; width:30px; height:30px; font-size:24px; background:transparent; border:0; }
      #svko-ai label { cursor:pointer; }
      #svko-ai input { accent-color:#2962ff; }
      #svko-ai [role=status] { color:#ffb4ab; margin:8px 0; }
      #svko-ai [hidden] { display:none; }
    </style><h2></h2><p>Choose a question. Use TICKER in your templates.</p><div class="questions"></div><button class="icon add" type="button" title="Add question" aria-label="Add question">+</button><fieldset aria-labelledby="svko-ai-open-in"><span id="svko-ai-open-in">Open in</span></fieldset><p role="status"></p><button class="close" type="button" aria-label="Close" title="Close">×</button>`;
    dialog.querySelector('h2').textContent = 'AI · ' + ticker;
    const status = dialog.querySelector('[role=status]');
    const enabled = SERVICES.map(([name], index) => {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = GM_getValue('service:' + name, index === 0) === true;
      checkbox.onchange = () => {
        GM_setValue('service:' + name, checkbox.checked);
        status.textContent = '';
      };
      label.append(checkbox, ' ' + name);
      dialog.querySelector('fieldset').append(label);
      return checkbox;
    });

    let questions = GM_getValue('questions', null);
    if (!Array.isArray(questions)) {
      questions = DEFAULTS.map((original, index) => ({ text: GM_getValue('question:' + index, null), original }))
        .filter(item => typeof item.text === 'string' && item.text.trim());
      if (!questions.length) questions = [{ text: DEFAULTS[0], original: DEFAULTS[0] }];
      GM_setValue('questions', questions);
    }
    const saveQuestions = () => GM_setValue('questions', questions);
    function addRow(item, editing = false) {
      const original = item.original;
      let question = item.text;
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = '<button type="button" class="question"></button><input class="editor" type="text" hidden><button type="button" class="icon edit"></button><button type="button" class="icon revert" title="Revert to default" aria-label="Revert question to default">↺</button><button type="button" class="icon delete" title="Delete question" aria-label="Delete question">×</button>';
      const go = row.querySelector('.question');
      const input = row.querySelector('.editor');
      const edit = row.querySelector('.edit');
      input.setAttribute('aria-label', 'Edit question');
      function render(editing = false) {
        go.textContent = question.replace(/\r?\n/g, ' ');
        go.hidden = editing;
        input.hidden = !editing;
        input.value = question.replace(/\r?\n/g, ' ');
        edit.textContent = editing ? '✓' : '✎';
        edit.title = editing ? 'Save question' : 'Edit question';
        edit.setAttribute('aria-label', edit.title);
        if (editing) input.focus();
      }
      edit.onclick = () => {
        if (!input.hidden) {
          if (!input.value.trim()) {
            status.textContent = 'Enter a question before saving.';
            input.focus();
            return;
          }
          question = input.value.trim();
          item.text = question;
          saveQuestions();
        }
        status.textContent = '';
        render(input.hidden);
      };
      input.onkeydown = event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          edit.click();
        }
      };
      row.querySelector('.revert').onclick = () => {
        question = original;
        item.text = question;
        saveQuestions();
        status.textContent = '';
        render();
      };
      row.querySelector('.delete').onclick = () => {
        questions.splice(questions.indexOf(item), 1);
        saveQuestions();
        row.remove();
        status.textContent = '';
      };
      go.onclick = () => {
        if (!enabled.some(checkbox => checkbox.checked)) {
          status.textContent = 'Select at least one service.';
          return;
        }
        const prompt = question.replaceAll('TICKER', () => ticker);
        try {
          SERVICES.forEach(([name, prefix, suffix], service) => {
            if (!enabled[service].checked) return;
            const query = encodeURIComponent(name === 'Grok' ? 'Search the web for current information and cite sources with links.\n\n' + prompt : prompt);
            GM_openInTab(prefix + query + suffix, { active: false, insert: true });
          });
          dialog.close();
        } catch (error) {
          status.textContent = 'Could not open every tab. Check opened tabs before retrying. ' + error.message;
        }
      };
      dialog.querySelector('.questions').append(row);
      render(editing);
    }
    questions.forEach(item => addRow(item));
    dialog.querySelector('.add').onclick = () => {
      const item = { text: DEFAULTS[0], original: DEFAULTS[0] };
      questions.push(item);
      saveQuestions();
      addRow(item, true);
    };
    dialog.querySelector('.close').onclick = () => dialog.close();
    dialog.onclick = event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    };
    dialog.onclose = () => dialog.remove();
    document.body.append(dialog);
    dialog.showModal();
  }

  document.addEventListener('contextmenu', event => {
    if (!event.target.closest?.('button#header-toolbar-symbol-search')) return;
    const ticker = document.querySelector('button#header-toolbar-symbol-search span[class^="value-"]')?.textContent.trim();
    if (!ticker) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openQuestions(ticker);
  }, true);
})();
