---
{
  "title": "Open AI questions for your chart symbol.",
  "name": "SVKO TradingView AI",
  "group": "tradingview",
  "summary": "Open your saved AI questions with the current TradingView symbol already inserted.",
  "label": "Saved questions",
  "order": 5,
  "markets": [
    "Browser"
  ],
  "visual": "ai",
  "capture": "Show the current chart symbol, the saved question dialog and selected services. Then show the prepared question opening in a service.",
  "source": "SVKO TradingView AI.user.js",
  "licence": "MIT",
  "install": [
    "Install Tampermonkey in your desktop browser and add the complete userscript.",
    "Reload a TradingView chart in that browser.",
    "Right click the symbol search button, edit a saved question and select the services to open."
  ],
  "related": [
    "tradingview-links",
    "tab-titles"
  ]
}
---

## Why I built it

Looking into a symbol often starts with the same question. Keeping the question saves rewriting it and copying the ticker each time.

## How it solves the problem

Right click the symbol search button in TradingView's chart toolbar. Choose a saved question and the services to open: ChatGPT, Perplexity, Google AI Mode or Grok. Each `TICKER` placeholder becomes the symbol captured when the dialog opened.

An example question is:

> Why has TICKER stock moved right now? Is there a catalyst? Short answer with a source.

Add, edit, revert or delete questions in the dialog. Questions and service selections are saved by the userscript and survive browser restarts. A question opens one background tab for each selected service.

### Browser requirement

This runs on the TradingView **website in a desktop browser**, with Tampermonkey. It is not a Pine indicator or a TradingView Desktop app add-on. Edge is the author's current preference; no speed advantage is claimed.

### What it does not automate

No AI API key is required. The script opens a prepared question, not a verified answer. Each service controls sign in, availability and any confirmation before sending. Grok receives a request to search for current sources, but that wording does not force a search mode. Check the answer and its sources yourself.

The ticker comes from the chart toolbar when the dialog opens, not from a watchlist selection. Unsaved edits disappear when the dialog is dismissed. The service websites can change their URL behaviour.
