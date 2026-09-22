---
{
  "title": "Review Trade Nation results and costs.",
  "name": "SVKO Trading Statistics",
  "group": "broker",
  "summary": "Archive Trade Nation history, separate trading results from cash movements and review the records behind each total.",
  "label": "Trading archive",
  "order": 10,
  "markets": [
    "Trade Nation",
    "USD accounts"
  ],
  "visual": "statistics",
  "capture": "With example or anonymised data, show the overview, calendar and coverage status. Remove account IDs, broker references and private transactions.",
  "source": "SVKO Trading Statistics.user.js",
  "licence": "MIT",
  "install": [
    "Install the complete userscript in Tampermonkey.",
    "Open your signed in Trade Nation CFD or Spread platform with a USD base account to collect history.",
    "Choose Open trading statistics from the manager menu on an ordinary HTTPS page.",
    "Review Data coverage and comparison status, then save a JSON backup in Settings."
  ],
  "related": [
    "trade-nation-hotkeys"
  ]
}
---

## Why I built it

A history table is not the whole picture. Trading P/L, funding, dividends and cash movements answer different questions. Keeping a local archive makes those distinctions easier to review, with the original records still available.

## How it solves the problem

The script imports Trade Nation CFD and Spread transactions into its own browser userscript storage. Review an overview, monthly calendar, transactions, costs and transfers. Account, instrument and date filters focus the views where applicable.

**Total return = closed position P/L + booked adjustments.** It is a USD cash result, not percentage investment return or account equity. Deposits and withdrawals are excluded. Funding and dividends are included when booked, including postings related to open positions.

### Import at the broker, view elsewhere

Only two broker importers are currently implemented: Trade Nation CFD at `platform-cfd.tradenation.com` and Spread at `platform.tradenation.com`, for **USD base accounts**. There is no IG importer.

Collect new records while signed into the appropriate Trade Nation platform. Afterwards, open the panel through **Open trading statistics** on another ordinary HTTPS page. The broker tab is not needed to read the stored archive. A bookmark ending in `#svko-trading-statistics` can also open it.

The archive belongs to the userscript in that browser profile. It is not synced by this website. Charts and JSON import need HTTPS; a page's content security policy may prevent charts, in which case use another HTTPS page.

### Check the records, not only the total

Each pull compares the available history against a separate broker export. Data shows coverage, missing records, field differences and saved warnings. A matching total alone is not a successful check. A match describes agreement at that time, not proof of the broker's internal database.

Automatic internal transfer matching requires a unique opposite amount in the same currency across two accounts, within one second. It is an inference; missing history can change the split. Manual classifications remain available.

### Check history coverage and save backups

Use all available history for the first baseline, review incomplete coverage and source changes, and keep JSON backups. Older broker records may stop being available. Empty calendar cells mean no stored activity, not proof of no trading. The website's example chart uses illustrative values and is not an account performance claim.
