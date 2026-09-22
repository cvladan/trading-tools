---
{
  "title": "Different prices. Comparable moves.",
  "name": "SVKO CFD NQ-ES Levels",
  "group": "indicator",
  "summary": "Translate the underlying market’s percentage move into levels on your Nasdaq 100 or S&P 500 CFD chart.",
  "label": "Index levels",
  "order": 4,
  "markets": [
    "Indices",
    "CFDs"
  ],
  "visual": "levels",
  "capture": "Show an NQ or ES CFD chart with the 0% basis, upper and lower levels, current price label and active mapped source.",
  "source": "SVKO_CFD_NQ-ES_Levels.pine",
  "licence": "MPL-2.0",
  "publication": "https://www.tradingview.com/script/VWtZmFRE-SVKO-CFD-NQ-ES-Levels/",
  "install": [
    "Add Levels to the intended NQ or ES CFD chart.",
    "Check the During main session and Outside main session source mappings.",
    "Keep a DEFAULT row in Level definitions and add exact chart overrides if needed.",
    "Use the optional Mapper only when the active local source mapping has no match."
  ],
  "related": [
    "real-volume",
    "symbol-mapper"
  ]
}
---

## Why I built it

I prefer working with my CFD chart around futures rollovers, but the CFD and the reference market do not share the same price scale. I need percentage moves translated onto the chart I actually use. This is my workflow preference, not a guarantee that CFDs avoid rollovers or broker adjustments.

## How it solves the problem

Levels reconstructs the mapped symbol's daily percentage change and calculates a **0% basis** on the CFD chart. Other percentage levels sit above and below that basis. A current price label shows the chart price's distance from it.

During the default New York weekday session, 09:30 to 16:00, NQ/ES defaults use QQQ and SPY. Outside that session they use the configured NQ, MNQ or ES futures. IG, Trade Nation and Trade Nation SB pairs are included. Active local mappings take priority over Mapper fallback.

### Define the levels you use

```text
DEFAULT = -ATR/2 to ATR step 1
TRADENATION:USTEC = -ATR/2 to ATR+1 step 0.5
```

Use explicit values, ascending or descending ranges, or ATR endpoints. ATR is the chart symbol's last confirmed daily ATR(14), not the mapped symbol's ATR. The script always includes 0%, removes duplicates and permits up to 50 unique levels. Exact chart overrides replace the default definition.

Stocks are a secondary configurable use: provide an appropriate mapping or Mapper counterpart. Native charts use their own ticker. The primary examples here remain NQ and ES.

### A snapshot, not a historical signal

The first valid live basis is cached for the active calculation symbol. Reloading, changing inputs or changing that symbol can create a different basis. Historical bars cannot reproduce the exact moment of the earlier snapshot. The moving price label remains live.

Feeds, sessions, spreads, currencies and permissions can cause differences. Unresolved mappings or unavailable daily data leave the display empty. Invalid level syntax shows a configuration error rather than partial levels. No alert conditions are defined.

### Credits

Original work by SVKO. Mozilla Public License 2.0, as recorded in the indicator documentation.
