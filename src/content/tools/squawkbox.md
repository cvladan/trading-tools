---
{
  "title": "Hear the price move.",
  "name": "SVKO TradingView Squawkbox",
  "group": "tradingview",
  "summary": "Hear rising and falling quotes from one selected TradingView chart, with a movement threshold and adjustable volume.",
  "label": "Hear price movements",
  "order": 13,
  "markets": [
    "Browser"
  ],
  "visual": "squawkbox",
  "diagram": "From a quoted price change to a short sound",
  "capture": "Explain a selected chart, the minimum price movement and rising or falling sound without playing audio.",
  "source": "SVKO TradingView Squawkbox.user.js",
  "licence": "SVKO 1.0",
  "install": [],
  "related": [
    "alert-speech",
    "custom-sounds"
  ],
  "downloadAvailable": false
}
---

## Why I built it

Watching every price update ties your attention to the screen. Squawkbox makes the direction of price movement audible using short sounds from the chart you choose.

## How it solves the problem

Squawkbox follows the last quoted price of one TradingView chart. Rising prices produce a higher rising sound, and falling prices produce a lower falling sound. Unchanged prices remain silent. Larger moves create a greater difference in pitch within a fixed range.

This is a browser userscript for the TradingView website. It runs through Tampermonkey in a desktop browser. It is not a Pine indicator or an add-on for TradingView Desktop.

### Choose the chart you want to hear

The panel starts stopped. Select a chart and click **Start** to bind that listening session to its chart and full symbol. Selecting another chart does not switch the sound source, and the Details panel can remain hidden.

Changing the selected chart's quote source or clearing its price series stops listening. Some interval changes can also stop the session. Click **Start** again to bind explicitly. Reloading the page starts stopped, and every tab needs its own **Start** click. A dedicated tab is recommended.

**Test up** and **Test down** preview the two sounds. **Stop** ends listening and closes the audio context. Closing the panel also stops playback; the Tampermonkey **Squawkbox** menu command reopens it.

### Choose how much movement to hear

**Move (ticks)** sets the minimum net movement from the last price that produced a sound. The current default is five ticks, using the chart's price step. For example, a price step of 0.1 makes five ticks equal to 0.5 points.

Small changes accumulate as net movement from that reference. Repeated movement back and forth does not add up as distance travelled. The script allows at most one market sound per 120 milliseconds, and a large jump produces one sound. Fast intermediate reversals may not all be heard.

**Volume** starts at 15%. Only volume and the movement threshold are saved in Tampermonkey storage. Chart selection and listening state are not saved.

### How it compares with PriceSquawk

Squawkbox shares the idea of listening to market movement with [PriceSquawk](https://pricesquawk.com/). It offers a simpler option for hearing quoted price changes within TradingView, free for personal use, including trading for your own profit.

PriceSquawk also provides [trade sounds, volume and order flow tools](https://app.pricesquawk.com/docs/intro). Squawkbox's current scope is the last quoted price of one selected chart. It does not analyse individual trades, traded volume, bid or ask execution, or iceberg orders, and it does not speak prices. The two tools do not offer the same feature set.

Squawkbox generates its sounds locally without an API key or paid audio service. TradingView access and any market data charges are separate. Company and employment use requires a paid agreement under the [SVKO licence](/licensing/).

### Data and playback limits

The script uses TradingView's internal chart interfaces, which can change. If they are unavailable, it reports an error without switching to another data source. Delayed quotes remain delayed, and Replay is not supported. The quoted price is used even when the chart displays synthetic candles.

Background quote updates and background audio have not yet been verified. Browsers may freeze or discard hidden tabs, and playback cannot continue while the computer sleeps. A **Start** or **Test** click enables browser audio explicitly.

Squawkbox bundles selected sound generators from [tiks](https://github.com/rexa-developer/tiks/tree/806cab3e06143d44545b6e8c49dfd94391277100), copyright 2026 Rexa, under its MIT licence. Original SVKO material has the separate personal and commercial terms linked above.
