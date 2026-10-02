---
{
  "title": "Choose a sound for each TradingView alert.",
  "name": "SVKO TradingView Alerts Custom Sounds",
  "group": "tradingview",
  "summary": "Assign locally stored recordings to TradingView alerts, then play the selected sound when a new alert toast appears.",
  "label": "Custom alert sounds",
  "order": 12,
  "markets": [
    "Browser"
  ],
  "visual": "custom-sounds",
  "diagram": "From an alert tag to your local recording",
  "capture": "Show an example sound tag and local recording lookup without private alert messages.",
  "source": "SVKO TradingView Alerts Custom Sounds.user.js",
  "licence": "SVKO 1.0",
  "install": [
    "Install Tampermonkey in your desktop browser, add the complete userscript and reload a TradingView chart. Keep only one copy enabled.",
    "Open an alert's Notifications screen. Under Custom sound, choose Add sound to import a local recording and give it a unique name such as soft-bell.",
    "Select the recording. The script enables toast notifications and disables native Play sound in the draft. Choose Apply to update the notification settings and sound tag.",
    "Choose Create or Save in TradingView to save the alert. Applying Notifications alone does not save it.",
    "Open Manage sounds and use Preview to check playback and enable audio in this tab if the browser blocks it. Trigger a new alert to check the complete flow."
  ],
  "related": [
    "alert-speech",
    "tab-titles"
  ]
}
---

## Why I built it

A distinct sound can help you recognise which alert needs attention without reading every notification. Custom Sounds lets you assign your own recordings to individual TradingView alerts and reuse them across alerts.

## How it solves the problem

The script adds a **Custom sound** selector to TradingView's alert **Notifications** screen. Choose a locally stored recording and the script adds its name to the alert message. When a new alert toast contains that tag, the corresponding recording plays once.

```text
NVDA crossed the level. [sound:soft-bell]
```

This example plays the recording named `soft-bell`. The script does not read the message aloud. It uses the audio you import, without an API key, speech generation or an audio upload.

### Choose and save an alert sound

Open an alert's **Notifications** screen and use **Add sound** to import a recording, or select one already in the library. Names must be unique and use lowercase letters, with single hyphens between words: `soft-bell` and `price-alert` are valid examples. Use exactly one sound tag per message.

Selecting a custom sound enables toast notifications and disables native **Play sound** in the notification draft. **Apply** updates these settings and writes the tag through TradingView's message editor, preserving the rest of the message. You must then choose **Create** or **Save** in TradingView to save the alert.

Opening the editor alone changes nothing. **Cancel** discards the notification draft, but any recordings you imported remain in your library. Selecting **None** removes the tag when you apply it; it does not switch native sound back on. Enabling native **Play sound** selects **None**.

### Keep a local sound library

Use **Manage sounds** in the editor or **Manage custom sounds** in this script's Tampermonkey menu. The library offers **Add**, **Preview**, **Replace audio** and **Delete**.

A sound's name is permanent. **Replace audio** keeps that name, so alerts that reference it use the replacement. **Delete** asks for confirmation and removes the recording without editing existing alert messages. An alert that still references a deleted sound produces a visible error.

Each file can contain up to **5 MiB** of audio, and the library can hold up to **50 MiB** of original audio bytes. The browser checks that it can decode a recording before saving it. WAV import and playback were verified in Edge; support for other formats depends on the browser.

Recordings stay in this userscript's Tampermonkey storage. Playback does not read the original file path or upload the recording. This local library is not a cloud backup: keep your original audio files and import them in each browser where you need them. Recordings stored by other userscripts are not imported automatically.

### Playback and browser limits

The script listens for new TradingView alert toasts on chart pages. Existing toasts are treated as already seen and are not replayed on startup. Sounds play once per detected event and may overlap; there is no playback queue.

If autoplay is blocked, open **Manage sounds** and use **Preview** to enable playback in the current tab. Missing recordings, invalid or multiple tags, and playback failures produce visible errors. The script does not guess a replacement sound.

Each chart tab operates independently, so several tabs may play the same alert. Background playback and playback across multiple tabs have not been verified live. Detection depends on TradingView's page structure: recreating an old toast can count it again, while identical updates in a reused node with the same displayed time cannot always be distinguished.

Disabling or removing the userscript leaves native **Play sound** disabled on alerts configured for custom audio. Enable it again in those alerts if you want TradingView's built-in sound.

### Using it with Alert Speech

[Alert Speech](/tools/alert-speech/) runs independently and may speak the literal `[sound:soft-bell]` marker as part of the message. Speech and custom audio can overlap. Custom Sounds does not remove tags from displayed toasts or change the Speech script.
