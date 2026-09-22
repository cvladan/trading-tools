---
{
  "title": "Name your TradingView browser tabs.",
  "name": "SVKO TradingView Tab Titles",
  "group": "tradingview",
  "summary": "Give TradingView browser tabs meaningful names, with one global template and individual tab overrides.",
  "label": "Your tab names",
  "order": 7,
  "markets": [
    "Browser"
  ],
  "visual": "tabs",
  "capture": "Show browser tabs before and after a global template, and one tab with an override. Keep the tab labels legible.",
  "source": "SVKO TradingView Tab Titles.user.js",
  "licence": "MIT",
  "install": [
    "Install the complete userscript and reload a TradingView chart in your desktop browser.",
    "Choose Set Global Tab Title in the userscript menu and enter a template.",
    "Use Set This Tab Title for an individual tab override."
  ],
  "related": [
    "tradingview-ai",
    "tradingview-links"
  ],
  "diagram": "Global titles and a single tab override"
}
---

## Why I built it

Several open charts can become hard to distinguish. I want meaningful browser tab names, with the parts I use in the order I expect.

## How it solves the problem

Set one global template, then override it for a particular tab if needed. The script follows TradingView's title and uses the values your active template requests.

```text
<title:p5> <title:arrow:v2> <title:p4> <title:p1>
```

The five title parts represent the symbol, price, direction arrow, percentage change and remaining market label. Templates also support `<layout>` and `<symbol>`, plus direction arrow variants from `v1` to `v8`.

### Set a global title or a title for one tab

**Set Global Tab Title** stores the shared template in the browser's local storage. **Set This Tab Title** stores an override in that tab's session storage. The override wins; clearing it restores the global template. Clear both to restore TradingView's native title.

This makes browser tabs more useful as a chart workspace. It does not claim to reproduce every feature of the desktop app.

### Browser requirement

Use the TradingView website in a desktop browser. This is not a Pine indicator and does not run inside TradingView Desktop. Edge with Tampermonkey is the current workflow; the guide also documents Firefox or Chrome with Violentmonkey. Stored titles belong to the browser profile and tab, not your TradingView cloud layout.
