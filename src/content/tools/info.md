---
{
  "title": "Company data on stock and CFD charts.",
  "name": "SVKO Info",
  "group": "indicator",
  "summary": "Use Info directly on native stock tickers, or connect Symbol Mapper to bring the original stock’s company data, earnings and valuation onto the broker CFD ticker you trade.",
  "label": "Native stocks and CFDs",
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
    "Add SVKO Info to a native stock chart to use that listing directly.",
    "On a broker CFD chart, connect both Symbol Mapper inputs or enter the exact CFD and native ticker pair in Mappings.",
    "Choose the rows, history window and display formats you need, then adjust table size and colours."
  ],
  "related": [
    "symbol-mapper",
    "real-volume"
  ],
  "diagram": "Native stock data, directly or through a CFD mapping"
}
---

## Why I built it

I want the same company information whether I am looking at a stock listed on an exchange or the CFD I trade through a broker. **Info works directly on ordinary stock tickers. With Symbol Mapper, it also brings the original stock's data onto a broker ticker that represents that stock.**

For example, `NASDAQ:NVDA` identifies the listed stock, while `TRADENATION:NVDA.EX` identifies a broker's CFD. The CFD ticker does not automatically inherit the company's earnings, analyst targets or valuation data. Info and Mapper make that connection explicit, so I can see the underlying company's figures beside the broker's candles.

## How it solves the problem

On a native stock chart, Info uses that chart's own listing without requiring Mapper. On a broker chart, it resolves the corresponding stock symbol, requests its available data and builds a table in the bottom right corner. The broker chart remains the instrument you are viewing and trading.

[Symbol Mapper](/tools/symbol-mapper/) supplies the connection when there is no matching pair in Info's own **Mappings** setting. A local pair is also sufficient on its own. This lets you share mappings across compatible indicators or configure Info independently.

The table follows this order: company, chart and counterpart symbols, performance, extended hours, history high, daily ATR, earnings, analyst target, then P/E, forward P/E and PEG. Optional rows appear only when enabled; earnings also needs a qualifying date. All numerical examples below are illustrative, not current market quotes.

## Symbols and company identity

### Company

**What it shows:** the company description supplied by TradingView for the calculation symbol. On a CFD chart, this is the mapped stock's company, not the broker's instrument description.

**How it is displayed:** the default maximum is 20 characters. Longer names are shortened and followed by `...`. A missing description displays `N/A`. Set **Company Name → Max characters (0 to disable)** to `0` to remove the row and its company request.

This row helps confirm that the selected mapping points to the company you intended.

### Chart Symbol

This is the full ticker of the chart you are looking at, including its exchange or broker prefix. For example, a CFD chart can display `TRADENATION:NVDA.EX` here. This identity row remains visible even when the optional metrics are disabled, provided Info has a usable calculation symbol.

Delayed native exchange suffixes such as `_DL` and `_DLY` are removed from the displayed mapping identity. This does not remove the delay from the actual feed.

### Original Symbol and CFD Symbol

On a broker chart, **Original Symbol** shows the mapped native stock ticker used for company data and calculations. On a native chart, the corresponding row is called **CFD Symbol** and shows a resolved broker counterpart when one exists. A native chart still calculates from its own ticker, even when it displays a CFD counterpart.

The counterpart row is omitted if no counterpart is known. If a broker chart has no usable native mapping at all, the entire Info display remains empty rather than using unrelated fundamentals.

### Choosing and connecting the mapping

Info checks its local **Mappings** first. Enter one complete pair per line, for example:

```text
TRADENATION:NVDA = NASDAQ:NVDA
TRADENATION:NVDA.EX = NASDAQ:NVDA
```

Use the exact broker ticker, including `.EX` where applicable. Local pairs work in both directions. When looking up the CFD counterpart of a US native ticker, Info recognises the NASDAQ, NYSE and BATS forms of the ticker name.

If no local pair matches, add Symbol Mapper to the same chart and connect both Info inputs:

| Info input | Select from the same Mapper instance |
| --- | --- |
| 1st code | Map: 1st code |
| 2nd code | Map: 2nd code |

Keep Mapper on the chart while these inputs are connected. It supplies the symbol identity; Info retrieves and calculates the figures. The default **Broker exchange prefixes** are `IG, TRADENATION, TRADENATIONSB`. This setting identifies broker charts; it does not create a mapping for every instrument offered by those brokers.

## Performance and historical prices

### Performance

**What it shows:** the native stock's percentage price change over each period you choose. It provides historical price context beside the current chart.

```text
Performance (%) = (latest regular session daily price / starting daily close - 1) × 100
```

The starting price is the close of the first available daily bar on or after the requested start date. If that date is a weekend or holiday, the next available trading day's close is used. This means a five day period refers to calendar days, not five completed trading sessions, and the move during the starting daily bar is not included.

The latest value comes from the regular session daily series. During the current session that daily bar can still change; after it ends, the latest regular close remains the reference. Premarket and postmarket prices are excluded from this row.

**Performance format** controls both the chosen periods and their labels:

| Placeholder | Period |
| --- | --- |
| `<last-N-days>` | N calendar days back |
| `<last-N-months>` | N × 30 days back |
| `<last-N-years>` | N × 360 days back |
| `<last-month>` | 30 days back, not the previous calendar month |
| `<last-year>` | 360 days back, not the previous calendar year |
| `<ytd>` or `<this-year>` | From 1 January of the current year |
| `<since-YYYY-MM-DD>` | From the specified date |
| `<nl>` | Always start a new line |
| `<cnl>` | Start a new line only if the following segment has an available value |

Replace `N` with a positive whole number. Dates are resolved against the source listing's daily calendar. Text outside the placeholders becomes your label. The default format is:

```text
<since-2026-04-01> since 1 Apr, <last-5-days> 5D<nl><last-month> 1M, <ytd> YTD
```

Up to 12 unique value placeholders are supported. Line break controls do not consume that allowance. `INVALID` identifies an unsupported or malformed value placeholder, `LIMIT` means the unique value allowance has been exceeded, and `N/A` means a requested value could not be calculated. Leaving the format blank disables the row.

### History window

**History window (days)** defaults to 365 and controls the history shared by Performance and the history high. A Performance period that starts before the window is omitted with its comma separated item. Increase the window if you want an older start date; a smaller window reduces the amount of history needed.

Performance and history high refresh at most once every 30 seconds, and only when the chart receives an update. They do not run on an independent timer. This setting does not limit the separate earnings history used by PEG.

### 365d High, or another selected window

**What it shows:** the highest regular session daily high within the selected history window, its age, the decline from it and the gain needed to reach it again. With a 365 day window the label is **365d High**. It is a window high, not necessarily the stock's lifetime high.

The row uses daily highs to find the peak and the latest regular session daily price for the comparison:

```text
Decline (%) = (high - current regular price) / high × 100
Recovery (%) = (high / current regular price - 1) × 100
```

Both displayed magnitudes have a minimum of zero. The recovery is larger than the decline because it starts from a lower price. For example, a fall from 200 to 150 is a 25% decline, but returning from 150 to 200 requires a 33.33% gain.

The age is the number of full elapsed days since the daily bar containing the high. The date identifies that daily bar, not the exact intraday moment of the peak. If equal highs occur again, the first retained occurrence remains the reference.

**Show history high** enables the row. **History high format** supports:

| Placeholder | Output |
| --- | --- |
| `<age>` | Age including `d ago` |
| `<decline>` | Decline magnitude including `%` |
| `<recovery>` | Required recovery including `%` |
| `<price>` | The high price |
| `<date>` | The date of the high's daily bar |
| `<nl>` | A new line |

The default is:

```text
<age><nl>▼ <decline> = ▲ <recovery><nl><price> @ <date>
```

Other text is literal. Missing high or comparison data produces `N/A`.

## Extended hours and the mapped price marker

### Extended Hours

**What it shows:** the active native premarket or postmarket move, with available **Post** and **Pre** components. This helps explain how the underlying stock has moved while a broker's chart may be quiet.

The comparison baseline depends on the chart:

| Chart | Baseline |
| --- | --- |
| Broker CFD | The broker chart's latest candle price |
| Native stock | The latest regular session daily price |

The total is `(active native extended price / baseline - 1) × 100`. On a broker chart it is a comparison between the native extended quote and the CFD price, so it is not necessarily the same number as the stock's own extended session return.

During postmarket, **Post** measures the move from the baseline to the current native postmarket price. During premarket, **Post** measures the move from the baseline to the previous postmarket close, and **Pre** measures the move from that close to the current premarket price. If the previous postmarket close is unavailable, Pre uses the baseline instead.

The total is calculated directly from prices, not by adding the rounded components. For example, a baseline of 100, a postmarket close of 102 and a premarket price of 103 produce:

```text
+3% (Post +2%, Pre +0.98%)
```

**Show extended-hours change** controls the row. If the source is in its regular session, or there is no usable active extended quote, the enabled row displays `N/A`. Positive and negative signs describe direction; this row uses ordinary white text rather than automatic green and red colouring.

### Mapped price marker

The marker is separate from the table. It draws the mapped native stock's latest available price as a horizontal line beside broker candles, including available extended trading. The quote comes from the native one minute series. Its purpose is to show where the source stock is trading while you remain on the CFD chart.

By default, **Show only while chart market is closed** is enabled. The marker appears outside the chart symbol's regular session or after its latest bar has closed. Disable that option to show it whenever a mapped quote is available. Native stock charts never display this marker.

| Setting | Default and behaviour |
| --- | --- |
| Distance from candle (bars) | 50 bars to the right of the latest candle |
| Line length (0 to disable) | 100 bars; zero hides the marker and disables its quote request |
| Line width | 1 |
| Line style | Dotted; Solid and Dashed are also available |
| Line colour | White; this is independent of the label colour |
| Label font size (pt) | 11, using monospace text |
| Label format | `<symbol> @ <exchange> · <price>` |

The format tokens insert the mapped ticker name, its exchange and its price. Other text is literal. The line's right edge is capped at 500 bars beyond the latest candle, so its displayed length can be shortened when the distance and length together exceed that limit.

Only the marker's label changes colour automatically. The comparison is `(native quote / broker chart price - 1) × 100`:

| Difference | Label colour |
| --- | --- |
| Greater than +0.10% | Green |
| Less than −0.10% | Red |
| From −0.10% to +0.10%, inclusive | White |

These are raw price comparisons. Extended Hours and the marker do not convert currencies or adjust a broker's different price scale. Check that the mapped instruments are comparable before interpreting the difference.

## Daily range and earnings

### Daily ATR

**What it shows:** Average True Range as a percentage of the source stock's daily price. It provides a measure of the size of recent daily movements, independent of the chart's intraday interval.

True Range is the largest of the daily high minus low, the absolute high minus the previous close, and the absolute low minus the previous close. TradingView's ATR applies Wilder's smoothing to those ranges. The default **ATR length** is 14 daily bars.

```text
Daily ATR (%) = daily ATR / daily price × 100
```

For example, an ATR of 6 at a daily price of 200 displays `+3%`. The plus sign is number formatting; ATR does not predict an upward move. **Show ATR percentage** controls the row. Insufficient price history or an unusable daily price produces `N/A`. The current daily value can change before that bar closes.

### Earnings

**What it shows:** a qualifying upcoming earnings report, or a recent report when there is no qualifying upcoming one. The data belongs to the native calculation symbol, including when you view a CFD.

The row applies this priority:

1. Show the upcoming report if it is within **Show earnings within (days)**, which defaults to 20.
2. Otherwise show the most recent reported earnings date if it is within **Show past earnings within (days)**, which defaults to 15.
3. If neither qualifies, omit the Earnings row.

The upcoming countdown rounds the remaining time up to whole days. Recent reports use full elapsed days since the recorded report bar. Dates and the special same day labels use the source exchange's timezone, which may differ from your local timezone.

| Situation | Display and emphasis |
| --- | --- |
| Upcoming report later today | `later today`, bold red |
| Upcoming report within 10 days | Formatted date and countdown, bold red |
| Upcoming report beyond 10 days but within your window | Formatted date and countdown, ordinary white text |
| Report recorded today | `was today`, bold green |
| Older report within your recent window | Formatted recent date, ordinary white text |

If today's scheduled report time has passed but no qualifying recent report is available, Info can also show `was today` from that schedule. This is not confirmation that results have been released. Recent report times come from daily earnings observations, so an hour shown in a custom recent date format should not be treated as the exact release time.

Set either display window to `0` to disable that part. Set both to `0` to disable earnings entirely. A qualifying future report takes priority even when a recent report also falls within its window.

The default **Earnings format** is `EEE, dd MMM, in X`. The default **Past earnings format** is `was X ago at dd MMM`. These tokens are available in both:

| Token | Meaning |
| --- | --- |
| `EEEE` / `EEE` | Full / abbreviated weekday |
| `yyyy` / `yy` | Four / two digit year |
| `MMMM` / `MMM` / `MM` | Full / abbreviated / numeric month |
| `dd` | Day of the month |
| `HH` / `hh` | Hour using a 24 / 12 hour clock |
| `mm` / `ss` | Minute / second |
| `a` | AM or PM, used as a standalone token |
| `X` | Complete duration, such as `1 day` or `5 days` |

`MM` means month; `mm` means minute. The special `later today` and `was today` labels replace your custom format for those cases.

## Analyst target and valuation

### Analyst Avg

**What it shows:** TradingView's available average analyst price target and its percentage distance from the native stock price. Info does not calculate a new analyst consensus or predict when the target will be reached.

```text
Distance (%) = (average target / native stock price - 1) × 100
```

A target of 120 against a price of 100 displays `120, ▲ 20%`. A lower target uses `▼` with the absolute percentage; an equal target uses `=`. The row stays white regardless of direction.

**Show analyst average target** controls the row. Its price comes from the native listing on the chart's interval and requested session, not from the CFD price. This request is separate from valuation's latest extended quote, so their reference prices can differ. Missing target or usable price data produces `N/A`.

### P/E and forward P/E

Enable **Show P/E ratios** to display the combined row:

```text
P/E    21.89 / Fwd 28.8 / PEG 0.28
```

**P/E** divides the latest available native stock price by diluted earnings per share for the trailing twelve months, or TTM. It shows the price relative to those reported earnings.

**Fwd** divides the same price by estimated earnings per share for the next twelve months, or NTM. It uses the rolling earnings estimate rather than a historical fiscal year's estimate or a stored annual P/E ratio.

Both use the native listing's price and currency, including available premarket and postmarket quotes. A regular or extended TRADENATION ticker uses the mapped stock's price and EPS, never the CFD price mixed with the stock's EPS. You do not need to keep a separate P/E or forward P/E indicator on the chart.

P/E or Fwd displays `N/A` independently when its EPS is missing, zero or negative, or its price is unusable. Performance and history high retain their regular session prices and do not change their basis when valuation is enabled.

### PEG

PEG puts trailing P/E alongside the growth in reported earnings. Info uses the trailing earnings calculation of TradingView's **Price/earnings to growth ratio**:

```text
Annual EPS growth (%) = (current EPS TTM - previous EPS TTM) / abs(previous EPS TTM) × 100
PEG = (native price / current EPS TTM) / annual EPS growth (%)
```

The previous EPS observation is four quarterly TTM reports earlier. This calculation needs enough reported earnings history; the annual comparison is based on those report observations. For example, P/E of 20 and EPS growth of 50% produce PEG of 0.40. The denominator is 50, not 0.50.

PEG changes with the native price, including available extended trading. It is not the reported quarterly `PEG_RATIO` snapshot. Missing earnings history, zero EPS denominators, or zero or negative annual growth produce `N/A`. Negative current EPS with positive growth can produce a negative PEG even when the separate P/E display is `N/A`.

Only the **PEG label and value** receive this emphasis:

| Unrounded PEG | Appearance |
| --- | --- |
| Greater than zero and below 0.30 | Green and bold |
| From 0.30 to below 0.50 | Green |
| 0.50 or above, zero, negative or unavailable | Ordinary white text |

The strict thresholds apply before rounding. A value of 0.299 can therefore display as `0.3` while remaining bold. A value exactly equal to 0.30 is green without bold, and exactly 0.50 is white. P/E, Fwd and the separators retain their ordinary style.

Hover the valuation values to inspect the source ticker, latest price and currency, EPS TTM, estimated EPS NTM and previous year EPS. Values are displayed with up to two decimal places rather than a fixed number of trailing zeros. Turning off **Show P/E ratios** disables the entire row and its valuation requests.

## Table appearance and updates

The table is anchored in the **bottom right** of the chart pane. There is no table position input. Labels and values are left aligned; multiline Performance and history high rows are top aligned.

| Table Styling setting | Default and effect |
| --- | --- |
| Table font size | 12 points |
| Table row height (%) | 0 for automatic height; otherwise a percentage of the chart window |
| Table font family | Monospace, with Default as the alternative |
| Table frame width | 0, so no outer frame; a nonzero width adds a white frame |
| Table background colour | Transparent black; adjustable colour and transparency |

There are no inner cell borders. Most text is white. Earnings, PEG and the mapped price label have the conditional colours described above; Performance, Extended Hours, ATR and Analyst Avg do not automatically turn green or red.

Optional features request their data only when enabled. Shared data remains available if another enabled feature needs it. Company name, Performance, earnings and the mapped marker use their zero or blank settings to disable their respective paths; the other metric rows have individual switches.

**The display updates when the chart receives data.** Closing the session does not by itself erase available valuation values, but a stopped broker feed cannot continuously refresh Info from an independently moving native market. Performance and history high also have their 30 second refresh limit. Current daily, price and valuation values may change before bars close; this table is current information, not a historical signal or backtest series.

## Missing rows and unexpected values

| What you see | What to check |
| --- | --- |
| No Info table on a broker chart | Exact broker ticker, broker prefix, local mapping, and both Mapper source inputs |
| Company name shortened | Increase Company Name's character limit |
| No Earnings row | Upcoming and recent windows, qualifying dates and the listing's earnings coverage |
| A Performance item disappears | Its start date may be outside History window |
| `INVALID` or `LIMIT` in Performance | Placeholder spelling, valid dates and the 12 unique value limit |
| Extended Hours shows `N/A` | The native source may be in its regular session or have no active extended quote |
| P/E, Fwd or PEG shows `N/A` | Missing or unusable earnings data; PEG also requires positive annual growth |
| Native chart has no mapped price line | The marker is available only on broker charts |
| Broker chart has no mapped price line | Mapping, nonzero line length, the closed market option and quote availability |
| Display stops changing after the broker closes | The chart may have stopped receiving updates |
| Two charts show different valuations | Compare source listing, currency, exact price time, sessions, feed delays and earnings data |

Fundamental coverage is primarily useful for stocks; company earnings and analyst targets are not promised for indices or every mapped instrument. Feed permissions and delays still apply. Performance excludes dividends, currency conversion, position size and fees, so it is a price comparison rather than your account return. The indicator does not create alerts or place trades.

## Credits

Original work by SVKO. Open source + commercial licence: free personal use, including trading for your own profit; company and work use require a separate paid agreement. This is source available, not an OSI open-source licence. See [the licence terms](/licensing/).
