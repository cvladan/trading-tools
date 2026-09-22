---
{
  "title": "Place and manage trades with hotkeys.",
  "name": "SVKO Trade Nation Hotkeys",
  "group": "broker",
  "summary": "Manual trading shortcuts and a position overlay for supported Trade Nation and TradeDirect365 chart pages.",
  "label": "Manual shortcuts",
  "order": 9,
  "markets": [
    "Trade Nation",
    "TradeDirect365"
  ],
  "visual": "hotkeys",
  "capture": "Use a demo account. Show the configured hotkeys and an entry, stop and take profit overlay. Do not place a live trade for the capture.",
  "source": "SVKO Trade Nation Hotkeys.user.js",
  "licence": "MIT",
  "install": [
    "Use the documented Firefox or Chrome and Violentmonkey setup.",
    "Add the complete source and review CONFIG before using any shortcut.",
    "Set DEMO_ONLY to true for your first checks and open a supported demo chart."
  ],
  "related": [
    "trading-statistics"
  ]
}
---

## Why I built it

Repeated manual actions are easier to reach when they have consistent keyboard shortcuts. The chart overlay keeps entry and protection levels visible alongside the candles.

## How it solves the problem

The script supplies shortcuts for market buy and sell, moving a selected stop towards entry, placing take profit near the current closing price, and closing positions.

| Shortcut | Action |
| --- | --- |
| Ctrl + Alt + B | Market buy |
| Ctrl + Alt + S | Market sell |
| Ctrl + Alt + E | Move selected stop to the configured break even offset |
| Ctrl + Alt + T | Place selected take profit near the closing price |
| Ctrl + Alt + X | Close the selected position |
| Ctrl + Alt + A | Close positions on the current chart market by default |

### Read the configuration first

**These shortcuts can submit real orders.** `DEMO_ONLY` is `false` in the source, so set it to `true` for initial testing. The default stake is `0.5`, stop distance is 10 points multiplied by the market's `BetPer`, and the break even offset is one point better than entry. These are configurable values, not recommendations for a position.

The script's selected position may be the latest one it opened, the newest open single position or a position near the pointer. Confirm the selection in a demo account before relying on a position shortcut. Broker risk controls and order acceptance still apply.

### Overlay and supported pages

Entry, stop and take profit lines are read only, not draggable. The overlay disables itself when Trade From Chart is detected, while the hotkeys remain available.

Supported hosts are `chart.tradenation.com`, `demochart.tradenation.com`, `chart-cfd.tradenation.com`, and the documented chart/demo hosts on `tradedirect365.com` and `tradedirect365.com.au`. This is not an IG integration or a TradingView add-on.

The script depends on internal platform objects and can break when the platform changes. Syntax checks are not proof of live trading behaviour. It acts when a hotkey is pressed; it is not an automated trading strategy.
