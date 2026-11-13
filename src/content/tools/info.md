---
{
  "title": "Company data beside your CFD chart.",
  "name": "SVKO Info",
  "group": "indicator",
  "summary": "See company information, earnings, analyst targets, P/E, forward P/E, PEG and price figures for the mapped stock symbol beside your CFD candles.",
  "label": "Stock context",
  "order": 2,
  "markets": [
    "Stocks",
    "CFDs"
  ],
  "visual": "info",
  "capture": "Show a stock CFD chart beside the Info table: native symbol, earnings, ATR and selected company metrics. Hide private account details.",
  "source": "SVKO_Info.pine",
  "licence": "SVKO 1.0",
  "publication": "https://www.tradingview.com/script/XP6l9CnM-SVKO-Info/",
  "install": [
    "Add SVKO Info to your TradingView chart.",
    "Check Mappings for your CFD and native ticker pair, or connect both Symbol Mapper inputs.",
    "Enable the rows you need; set the table size and position for your chart."
  ],
  "related": [
    "symbol-mapper",
    "real-volume"
  ],
  "diagram": "From the CFD symbol to company data"
}
---

## Why I built it

When I trade a stock CFD, I want the company’s earnings, valuation and stock price figures on the same chart. Info uses the matching exchange ticker to show the company’s data beside my broker’s candles.

## How it solves the problem

The table can show the company and symbol, performance over chosen periods, extended session movement, a history high, daily ATR, earnings timing, analyst targets, P/E, forward P/E and PEG. Each optional row requests its data only when enabled.

A local mapping works without a companion indicator:

```text
TRADENATION:NVDA = NASDAQ:NVDA
```

Local mappings take priority. If no local pair matches, Info can use both inputs from **Symbol Mapper**. On native charts, it uses the chart's own symbol. A broker chart with no resolved counterpart remains empty.

### Choose the figures to display

Performance uses regular session daily closes. The history window defaults to 365 days; requests outside that window are omitted. The optional mapped price marker places the latest available extended session quote beside the CFD candles. Set its line length to zero to disable it.

Earnings, analyst targets and valuation ratios depend on the listing and available coverage. They are especially useful for stocks, and are not promised for indices. Missing values can appear as `N/A`.

### P/E, forward P/E and PEG

Enable **Show P/E ratios** to display all three values in one row. For example: `P/E 21.89 / Fwd 28.8 / PEG 0.28`. These are illustrative values.

P/E and forward P/E use the latest available price of the native stock, including premarket and postmarket. P/E divides that price by trailing twelve month earnings per share. Forward P/E uses estimated earnings per share for the next twelve months. Regular and extended TRADENATION tickers both use the mapped stock price and its earnings.

PEG follows TradingView's **Price/earnings to growth ratio**: trailing P/E divided by positive annual percentage growth in trailing twelve month earnings. It changes with the native stock price. Only the PEG text receives the extra emphasis:

| PEG value | Appearance |
| --- | --- |
| Above zero and below 0.30 | Green and bold |
| From 0.30 to below 0.50 | Green |
| 0.50 or above, zero, negative or unavailable | Normal text |

Thresholds apply before rounding. PEG displays `N/A` when annual earnings growth is zero or negative, or the required earnings history is unavailable. Other available ratios remain visible. Hover the row to inspect the native price and earnings used in the calculation.

### What can change

Current values and mapped quotes can change before the bar closes. Updates depend on the chart receiving an update, so a stopped broker feed can leave the display unchanged. Performance excludes dividends, currency conversion, position size and fees. It is market context, not your account return.

Performance refresh uses intrabar state that historical bars cannot reproduce after a reload. Current earnings and extended session displays should not be read as historical trading signals. Feed permissions, delays and sessions still apply.

### Credits

Original work by SVKO. Open source + commercial licence: free personal use, including trading for your own profit; company and work use require a separate paid agreement. See [the licence terms](/licensing/).
