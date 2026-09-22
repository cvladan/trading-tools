---
{
  "title": "Choose the volume source for your CFD.",
  "name": "SVKO CFD Stocks & NQ-ES Real Volume",
  "group": "indicator",
  "summary": "Use stock volume for a stock CFD, or a defined futures and ETF activity proxy for NQ and ES.",
  "label": "Stocks + indices",
  "order": 3,
  "markets": [
    "Stocks",
    "Indices",
    "CFDs"
  ],
  "visual": "volume",
  "capture": "Show the CFD price chart, external volume columns and Real VWAP. Include the active formula and name every source.",
  "source": "SVKO_CFD_Stocks_and_NQ-ES_Real_Volume.pine",
  "licence": "SVKO 1.0",
  "publication": "https://www.tradingview.com/script/ulDZ4fEm-SVKO-CFD-Stocks-NQ-ES-Real-Volume/",
  "install": [
    "Add Real Volume to a standard time based TradingView chart.",
    "Choose a Volume formulas entry for the exact chart ticker, using valid source symbols.",
    "For Mapper fallback, connect both Map inputs and check the eligible broker prefix.",
    "Choose Main Session or Full Session for the optional Real VWAP."
  ],
  "related": [
    "symbol-mapper",
    "info",
    "cfd-levels"
  ],
  "diagram": "How external volume reaches your CFD chart"
}
---

## Why I built it

I want to see activity in the corresponding market while keeping the CFD chart I trade. The useful source might be an exchange stock symbol, or a combination of futures and an ETF. This is a choice of context, not a claim that all broker volume is wrong.

## How it solves the problem

The indicator displays the chosen volume as columns in its own pane. Optional **Real VWAP** uses that volume to weight the CFD chart's price. It is not the native symbol's VWAP.

For a stock CFD, a direct formula can select the stock exchange symbol:

```text
TRADENATION:NVDA.EX = NASDAQ:NVDA
```

For index CFDs, the defaults use adjustable activity proxies:

```text
MNQ + 10*NQ + 60*QQQ
MES + 10*ES + 60*SPY
```

These are weighted futures and ETF volumes, not directly traded index volume or an official consolidated measure. The coefficients are adjustable examples of the author's normalisation. A formula may contain up to ten terms with positive weights.

### Formula first, Mapper second

An explicit matching formula takes priority. If none matches, eligible IG, Trade Nation and Trade Nation SB charts can use a valid Mapper result as one source with weight 1. Both Map inputs must be connected. Invalid active formulas do not silently fall back.

Defaults include IG and Trade Nation NQ/ES pairs. Check individual stock entries: `IG:NVDA = IG:NVDA` points to the IG symbol itself, not NASDAQ. Change the source if you want the native exchange volume.

### Sessions and missing data

Main Session is the default VWAP anchor; Full Session follows the active source session. Source feeds can have different sessions, delays and permissions. A source with valid earlier data may contribute zero on a missing bar; a source that has never supplied data can leave the calculation incomplete.

Use a standard time based chart. Daily and higher charts have less intraday detail. Current volume and VWAP develop until the bar closes. The indicator has no alert conditions.

### Credits

Original work by SVKO. Open source + commercial licence: free personal use, including trading for your own profit; company and work use require a separate paid agreement. See [the licence terms](/licensing/).
