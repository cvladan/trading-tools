---
{
  "title": "Click a ticker to open its chart.",
  "name": "SVKO TradingView Links",
  "group": "tradingview",
  "summary": "Click recognised ticker text drawn on a TradingView canvas to open the corresponding chart.",
  "label": "Chart navigation",
  "order": 6,
  "markets": [
    "Browser"
  ],
  "visual": "links",
  "capture": "Show a recognised ticker on a canvas with its hover outline, then the chart opened by a normal or modified click.",
  "source": "SVKO TradingView Links.user.js",
  "licence": "MIT",
  "install": [
    "Install the complete userscript in a browser userscript manager.",
    "Reload TradingView and hover over supported ticker text on a canvas.",
    "Use the manager menu to choose extra prefixes and your preferred link opening behaviour."
  ],
  "related": [
    "tradingview-ai",
    "tab-titles"
  ]
}
---

## Why I built it

A ticker is useful only if I can get to its chart. This tool removes the manual copy and search step for recognised symbols drawn on TradingView canvases.

## How it solves the problem

A small outline and pointer appear over detected ticker text. Click to open that symbol in the active chart when TradingView's internal chart API is available. Otherwise the script opens a TradingView chart URL.

Use Shift, Ctrl or Command with a click to open a new tab. The userscript menu can also make a new tab the normal click behaviour.

### Choose the symbols it recognises

Built in prefixes include NASDAQ, NYSE, AMEX and several European exchanges. Default extra prefixes include Trade Nation and IG. **Set extra prefixes** accepts a comma separated list and reloads the page to apply it.

Recognition applies to supported ticker text drawn through canvas text methods. It does not turn every label or piece of ordinary page text into a link.

### Browser requirement and limits

This is a browser enhancement for the TradingView website, not a Pine script or an add-on for TradingView Desktop. The current workspace uses Edge or Chrome with Tampermonkey. The original guide also documents Firefox or Chrome with Violentmonkey.

TradingView's rendering or internal API changes can affect detection or navigation. Clicks outside a detected ticker are left alone. IG ticker recognition is not integration with the IG broker website.
