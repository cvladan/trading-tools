# Trading Tools

TradingView indicators and desktop browser userscripts with open source + commercial licence terms, clear setup guides and annotated visual examples. Personal use is free, including real-money trading for your own profit. Company and employment use require a separate paid agreement.

- Website: [trading.cvladan.com](https://trading.cvladan.com)
- Source and contributions: [cvladan/trading-tools](https://github.com/cvladan/trading-tools)
- Main groups: Indicators and Userscripts
- Each tool has a stable `/tools/<slug>/` page

## Development

Use Node.js 22.12 or later and npm.

```sh
npm ci
npm run dev
```

The local development server is available at `http://127.0.0.1:4321/`.

```sh
npm run check
npm run build
npm test
npm run preview
```

Astro builds static HTML from the Markdown entries in `src/content/tools/`. Shared layouts and components live in `src/layouts/` and `src/components/`; plain CSS lives in `src/styles/global.css`. Small browser scripts handle the colour theme, illustrative hover prices and decorative effects. No application backend, database, analytics or client framework is required.

## Deployment

The website uses Cloudflare Workers Static Assets. `wrangler.jsonc` targets the `trading-tools` Worker and its custom domain, `trading.cvladan.com`.

```sh
npx wrangler login
npm run deploy
```

Use an authorised Cloudflare account. Credentials stay in Wrangler's local credential store or deployment secrets, never in this repository. Deployment serves the Astro `dist/` directory; it does not execute the distributed tool sources.

## Content and illustrations

Public content uses British English. Tool pages explain the problem, the practical solution, setup and relevant limitations. Source copies in `public/sources/` are separate from the site implementation and retain their notices.

Permanent explanatory diagrams show how each tool works. Numerical examples are labelled. The homepage workspace remains an illustrative mockup with synthetic values. [The capture checklist](SCREENSHOT_CHECKLIST.md) lists optional screenshots or clips that can add a view of the actual interfaces. The public `/capture-guide/` shows the diagrams and matching capture suggestions. No screenshot is required to complete a diagram.

The website is responsive and can be read on phones. Userscripts require a supported desktop browser and manager. Pine mobile rendering is possible, but the author's mobile output has not been reviewed or tested.

## Licences and contributions

Current original website, userscripts and Pine sources: [SVKO Personal Use and Commercial Licence 1.0](LICENSE). Read [the licensing guide and commercial enquiries](https://trading.cvladan.com/licensing/) and [source licensing and attribution](public/sources/LICENSING.md). Public source access does not grant unrestricted business use: this is a source-available licence, not an OSI open-source licence.


Open an issue for a reproducible problem, or send a focused pull request. Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing changes. Do not include private trading records or account information.
