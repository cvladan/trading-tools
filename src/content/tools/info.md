---
{
  "title": "Company data beside your CFD chart.",
  "name": "SVKO Info",
  "group": "indicator",
  "summary": "See company information, earnings, analyst targets and price figures for the mapped stock symbol beside your CFD candles.",
  "label": "Stock context",
  "order": 2,
  "markets": [
    "Stocks",
    "CFDs"
  ],
  "visual": "info",
  "capture": "Show a stock CFD chart beside the Info table: native symbol, earnings, ATR and selected company metrics. Hide private account details.",
  "source": "SVKO_Info.pine",
  "licence": "MPL-2.0",
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

The table can show the company and symbol, performance over chosen periods, extended session movement, a history high, daily ATR, earnings timing, analyst targets and P/E. Each optional row requests its data only when enabled.

A local mapping works without a companion indicator:

```text
TRADENATION:NVDA = NASDAQ:NVDA
```

Local mappings take priority. If no local pair matches, Info can use both inputs from **Symbol Mapper**. On native charts, it uses the chart's own symbol. A broker chart with no resolved counterpart remains empty.

### Choose the figures to display

Performance uses regular session daily closes. The history window defaults to 365 days; requests outside that window are omitted. The optional mapped price marker places the latest available extended session quote beside the CFD candles. Set its line length to zero to disable it.

Earnings, analyst targets and P/E depend on the listing and available coverage. They are especially useful for stocks, and are not promised for indices. Missing values can appear as `N/A`.

### What can change

Current values and mapped quotes can change before the bar closes. Updates depend on the chart receiving an update, so a stopped broker feed can leave the display unchanged. Performance excludes dividends, currency conversion, position size and fees. It is market context, not your account return.

Performance refresh uses intrabar state that historical bars cannot reproduce after a reload. Current earnings and extended session displays should not be read as historical trading signals. Feed permissions, delays and sessions still apply.

### Credits

Original work by SVKO. Mozilla Public License 2.0, as recorded in the indicator documentation.
