# Diagrams and capture checklist

Each tool has a permanent explanatory diagram. Screenshots and clips are optional additions that can show the actual interface. The homepage workspace remains a labelled illustrative mockup with synthetic values.

Use a clean desktop chart or browser window. Provide a wide crop and a close feature crop for small screens. Keep labels readable. Remove private account identifiers, broker references and personal records. Use a demo account for Hotkeys; never place a live trade for a recording. Short clips should show only the interaction, with a still alternative for reduced motion.

| Tool | Page and section | Permanent diagram | Optional interface capture |
| --- | --- | --- | --- |
| SVKO CFD NQ-ES Levels | [/tools/cfd-levels/#example](https://trading.cvladan.com/tools/cfd-levels/#example) | [View diagram](https://trading.cvladan.com/capture-guide/#cfd-levels) | Show an NQ or ES CFD chart with the 0% basis, upper and lower levels, current price label and active mapped source. |
| SVKO Info | [/tools/info/#example](https://trading.cvladan.com/tools/info/#example) | [View diagram](https://trading.cvladan.com/capture-guide/#info) | Show a stock CFD chart beside the Info table: native symbol, earnings, ATR and selected company metrics. Hide private account details. |
| SVKO CFD Stocks & NQ-ES Real Volume | [/tools/real-volume/#example](https://trading.cvladan.com/tools/real-volume/#example) | [View diagram](https://trading.cvladan.com/capture-guide/#real-volume) | Show the CFD price chart, external volume columns and Real VWAP. Include the active formula and name every source. |
| SVKO CFD Symbol Mapper | [/tools/symbol-mapper/#example](https://trading.cvladan.com/tools/symbol-mapper/#example) | [View diagram](https://trading.cvladan.com/capture-guide/#symbol-mapper) | No screenshot required. Keep the permanent CFD ticker → Map → mapped exchange symbol → receiver inputs diagram. |
| SVKO TradingView Tab Titles | [/tools/tab-titles/#example](https://trading.cvladan.com/tools/tab-titles/#example) | [View diagram](https://trading.cvladan.com/capture-guide/#tab-titles) | Show browser tabs before and after a global template, and one tab with an override. Keep the tab labels legible. |
| SVKO Trade Nation Hotkeys | [/tools/trade-nation-hotkeys/#example](https://trading.cvladan.com/tools/trade-nation-hotkeys/#example) | [View diagram](https://trading.cvladan.com/capture-guide/#trade-nation-hotkeys) | Use a demo account. Show the configured hotkeys and an entry, stop and take profit overlay. Do not place a live trade for the capture. |
| SVKO Trading Statistics | [/tools/trading-statistics/#example](https://trading.cvladan.com/tools/trading-statistics/#example) | [View diagram](https://trading.cvladan.com/capture-guide/#trading-statistics) | With example or anonymised data, show the overview, calendar and coverage status. Remove account IDs, broker references and private transactions. |
| SVKO TradingView AI | [/tools/tradingview-ai/#example](https://trading.cvladan.com/tools/tradingview-ai/#example) | [View diagram](https://trading.cvladan.com/capture-guide/#tradingview-ai) | Show the current chart symbol, the saved question dialog and selected services. Then show the prepared question opening in a service. |
| SVKO TradingView Links | [/tools/tradingview-links/#example](https://trading.cvladan.com/tools/tradingview-links/#example) | [View diagram](https://trading.cvladan.com/capture-guide/#tradingview-links) | Show a recognised ticker on a canvas with its hover outline, then the chart opened by a normal or modified click. |
| SVKO TradingView Watchlist | [/tools/watchlist/#example](https://trading.cvladan.com/tools/watchlist/#example) | [View diagram](https://trading.cvladan.com/capture-guide/#watchlist) | Show the same watchlist badge before and during hover, plus an ordinary instrument displaying its Last price on row hover. |

## Adding an optional interface capture

Save the approved still as `public/media/<tool-slug>.webp`, with an informative alt description. For a short recording, also supply a poster still and captions where spoken explanation is needed. Add the approved media alongside that tool’s `Visual` rendering in `src/pages/tools/[id].astro`, retaining the surrounding page and canonical URL. Reuse the same media on catalogue cards where its crop remains legible. Keep mockup labels on illustrative interface examples until replaced. Keep the permanent explanatory diagrams.

Do not claim an illustration is a verified product screenshot. The site itself is responsive; the author has not tested the indicators’ mobile output.
