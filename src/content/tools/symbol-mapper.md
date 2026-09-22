---
{
  "title": "Match CFD and exchange symbols.",
  "name": "SVKO CFD Symbol Mapper",
  "group": "indicator",
  "summary": "Match a broker CFD ticker to its exchange symbol, then share that match with compatible indicators.",
  "label": "Start here",
  "order": 1,
  "markets": [
    "Stocks",
    "Shared setup"
  ],
  "visual": "mapper",
  "diagram": "Example symbol mapping",
  "capture": "No screenshot required. Keep the permanent diagram showing the CFD ticker, mapped exchange symbol and both receiver inputs.",
  "source": "SVKO_CFD_Symbol_Mapper.pine",
  "licence": "SVKO 1.0",
  "publication": "https://www.tradingview.com/script/XCvJ5tx9-SVKO-CFD-Symbol-Mapper/",
  "install": [
    "Add Symbol Mapper to the same TradingView chart as the receiving indicator.",
    "Check the symbol pair. Custom mappings take priority over the built in Trade Nation map.",
    "In the receiver, connect 1st code to Map: 1st code and 2nd code to Map: 2nd code from the same instance.",
    "Leave Map on the chart while the receiver uses these inputs."
  ],
  "related": [
    "info",
    "real-volume",
    "cfd-levels"
  ]
}
---

## Why I built it

A broker CFD ticker and the matching stock exchange symbol have different identities. Repeating those pairs in every indicator makes a small change unnecessarily repetitive. Mapper gives compatible indicators a shared place to find the counterpart.

## How it solves the problem

Add **Map** once to the chart, configure the pair and connect both receiver inputs. It sends the symbol identity through two hidden plots. After setup, Map looks up the current chart symbol automatically, and the receiving tool requests the data it needs. Mapper itself draws nothing and fetches no price or volume.

```text
TRADENATION:NVDA.EX = NASDAQ:NVDA
IG:AAPL = NASDAQ:AAPL
```

Custom pairs take priority over the built in Trade Nation map. On an eligible broker chart, the lookup goes from CFD to native symbol. On a native chart, it returns the first matching CFD counterpart.

### When do I need it?

Use Mapper when **Info**, **Real Volume** or **Levels** receives its two code inputs. Keep it on that chart after the initial connection. You do not need it when Info or Levels has a suitable local mapping, or Real Volume has an explicit formula. Those settings take priority.

### Supported symbols and mapping limits

The source recognises IG, Trade Nation and Trade Nation SB prefixes. This is not a promise that every instrument has a built in pair. Unresolved mappings send zero and receivers remain empty where appropriate.

The transport accepts uppercase letters, digits, `-`, `:`, `.`, and `_`, up to 18 encoded characters, with compact Trade Nation prefixes. It does not transport `!`. Use the receiver's direct mapping or volume formula for continuous futures such as `CME_MINI:NQ1!`.

### Credits

Original work by SVKO. Open source + commercial licence: free personal use, including trading for your own profit; company and work use require a separate paid agreement. See [the licence terms](/licensing/). Earlier valid MPL-2.0 grants remain available for the material they cover.
