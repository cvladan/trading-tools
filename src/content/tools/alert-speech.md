---
{
  "title": "Hear what your TradingView alert says.",
  "name": "SVKO TradingView Alert Speech",
  "group": "tradingview",
  "summary": "Read new TradingView alert messages aloud through OpenRouter and reuse saved recordings when the same message returns.",
  "label": "Spoken alerts",
  "order": 11,
  "markets": ["Browser"],
  "visual": "alert-speech",
  "diagram": "From a new alert to a spoken message",
  "capture": "Show a new example alert and the speech status without revealing API keys or private alert messages.",
  "source": "SVKO TradingView Alert Speech.user.js",
  "licence": "SVKO 1.0",
  "install": [
    "Install Tampermonkey in your desktop browser and add the complete userscript. Keep only one copy enabled.",
    "Reload a chart at www.tradingview.com and enable toast notifications for the TradingView alerts you want to hear.",
    "Choose Speech settings from this script's Tampermonkey menu. Enter your OpenRouter API key, choose a speech model and set the default language.",
    "Use Test speech to check the current settings, then choose Save to keep them. Testing alone does not save settings.",
    "If playback is blocked, click Enable audio in the chart's speech panel. Trigger a new alert to check the complete flow."
  ],
  "related": ["tradingview-ai", "tab-titles"]
}
---

## Why I built it

An alert sound tells you something happened. Hearing the message tells you which symbol or condition needs attention, without first reading the notification on the chart.

## How it solves the problem

Alert Speech reads new TradingView alert toasts, generates speech through OpenRouter and plays each message in order. Its small chart panel shows the latest message, its time, the number of alerts detected and the speech status.

After generating a recording, the script saves it in Tampermonkey storage. When the same cleaned message, language and generation settings return, it reuses that recording without another generation request. A changed price in the message creates a different recording. Changing the model, voice or other request options can also require new audio.

The script starts automatically on TradingView chart pages. It reads the page's alert notifications, not alert history or operating system notifications. Existing toasts are treated as already seen. Order notifications and other notification groups are ignored.

### Choose a language

Write the alert in the language you want to hear. Without a tag, the saved default language applies. Add `[say]` to make that choice explicit, or use a language code such as `[say:en]` or `[say:sr]` anywhere in the message:

```text
[say:en] NVDA crossed the level.
```

The example is spoken as “NVDA crossed the level.” The tag is removed before generation. Language tags guide pronunciation; they do not translate the message. Use one language per message. Invalid or conflicting tags pause speech with an explanation, and pronunciation still depends on the selected model.

### Set up and test the voice

Use **Speech settings** in the Tampermonkey menu to enter your OpenRouter API key, model and default language. The supplied configuration uses a Google speech model, the Kore voice and English. Model availability and supported options depend on the provider.

Expand **Request JSON** to change the voice, audio format or provider options. **Load model defaults** replaces this template for the selected model; simply changing the model keeps your existing JSON. Check that the options suit the new model. The `model` and `input` fields come from the separate model setting and message, so leave them out of this JSON.

For advanced configuration, `{{language}}` and `{{locale}}` in JSON string values insert the selected language and its locale. **Request preview** shows the resolved request for the test message. The API key is sent separately.

**Test speech** uses the fields currently on screen without saving them. It can generate and save a recording, or reuse one already stored. Choose **Save** separately to apply your settings. Testing, saving settings and reloading restart the listening session, reset the count and clear waiting alerts; saved recordings remain available.

If the browser blocks playback, click **Enable audio** in the chart panel. Native TradingView sounds remain unchanged. Turn off the native sound in the relevant alerts if you want speech alone. To stop this userscript, disable it in Tampermonkey and reload the chart.

### API access, costs and local storage

You need your own OpenRouter API key and access to a compatible speech model. Generating speech sends the cleaned message and request options to OpenRouter and the selected provider, and may incur API charges. The website does not generate speech or collect your key.

The key is stored in this userscript's Tampermonkey settings. Saved recording records contain the request text, its options and audio, without the API key. This is local extension storage, not a cloud backup. There is no recording management screen or automatic expiry, and browser or extension storage limits still apply.

Each chart tab runs independently. Multiple tabs may speak the same alert, and simultaneous first requests may generate and charge for the same message more than once. Cancelling a request does not guarantee that generation was not already charged.

### Playback and detection limits

Use the TradingView website in a desktop browser with Tampermonkey. Development checks covered Edge, including English and Serbian speech and reuse of a saved recording after reload. Background playback remains unverified. This script is not a Pine indicator or a TradingView Desktop app add-on.

Without a saved API key, alerts are detected but are not queued for later speech. A storage, API, decoding or playback error pauses speech and clears waiting alerts while detection continues. There are no automatic retries or fallback voices. Correct the problem, then reload the chart or save settings again. Previous alerts will not be replayed.

Only one recording is generated and played at a time. A queue of more than 100 waiting alerts pauses speech and clears that queue. Detection relies on TradingView's page structure: recreating an old notification can count it again, and replacing the entire alert container can require a reload. The script does not create or change your TradingView alert rules.
