---
{
  "title": "See watchlist prices on hover.",
  "name": "SVKO TradingView Watchlist",
  "group": "tradingview",
  "summary": "Keep extended session percentages visible, then hover for a price without leaving the watchlist.",
  "label": "Watchlist detail",
  "order": 8,
  "markets": [
    "Browser"
  ],
  "visual": "watchlist",
  "capture": "Show the same watchlist badge before and during hover, plus an ordinary instrument displaying its Last price on row hover.",
  "source": "SVKO TradingView Watchlist.user.js",
  "licence": "MIT",
  "install": [
    "Install the complete userscript in Tampermonkey.",
    "Reload a TradingView chart with a watchlist visible.",
    "Hover an extended session badge, or an ordinary instrument row, to see its price."
  ],
  "related": [
    "tradingview-links",
    "info"
  ],
  "diagram": "Example watchlist price interaction"
}
---

## Why I built it

I want extended session context without adding another permanent price column. The percentage can stay visible until I need the actual price.

## How it solves the problem

Available premarket or postmarket percentages appear beside the symbol. Hover the badge to replace its percentage with a white calculated price. Move away and the percentage returns.

For instruments without extended session data, nothing extra is shown at rest. Hover the row to show its native **Last** price beside the symbol. Existing watchlist columns remain unchanged.

### Where the price comes from

Both values come from the same watchlist row. Where available, the script combines regular Last with the absolute extended session change. Otherwise it uses the displayed extended percentage:

```text
extended price = Last × (1 + extended percentage / 100)
```

A rounded percentage can produce an approximate price. Missing price data leaves the valid percentage visible; missing regular prices do not create a placeholder price. The script does not request a separate market data feed.

### Browser requirement

This runs on the TradingView website in a desktop browser, not inside the native TradingView Desktop app. Install it as a userscript, not as a Pine indicator. Edge with Tampermonkey is the documented current workflow.

Rows refresh every 1.5 seconds while the tab is visible, and hover reads the row immediately. TradingView layout changes or unavailable feed data can affect the result.

### Credits

The supplied source retains its MIT licence notice. Keep that notice when sharing or adapting the script.
