# Search and sharing

Audited on 22 September 2026. Production is https://trading.cvladan.com.

## Implementation

The shared Astro layout renders unique titles and descriptions, absolute HTTPS canonical URLs, British English language metadata, Open Graph and Twitter cards directly into HTML. The homepage and category titles explain the site's subject. Tool descriptions come from the same content entries as their visible introductions.

The social preview is a text only image using the site's colours. `public/social-preview.svg` is the editable original; `public/social-preview.png` is the 1200 × 630 image used by sharing services. It contains no logo or product screenshot. After editing the SVG, regenerate the PNG with the Sharp package already installed by Astro:

```sh
node --input-type=module -e "import sharp from 'sharp'; await sharp('public/social-preview.svg').png().toFile('public/social-preview.png')"
```

The homepage supplies `WebSite` data. Category pages describe their actual tools with `CollectionPage` and `ItemList`. Tool pages supply `BreadcrumbList` matching the visible navigation and `SoftwareSourceCode` with the public source location, language and licence explanation. There are no ratings, prices, offers, claimed endorsements or invented software compatibility. Source descriptions do not claim eligibility for Google's software application rich results.

The sitemap contains the indexable public pages and follows the content collection as tools are added. Installation, about and licensing guidance remains public and indexable. The capture guide is a contributor reference which repeats diagrams already present on tool pages, so it uses `noindex, follow` and is omitted from the sitemap. It remains linked and accessible. The custom 404 also uses `noindex`, has its own description and omits the misleading canonical URL previously attached to every missing address. Robots rules allow crawling, including access to these directives and source downloads.

Existing working features were retained: static readable content, one main heading per page, production canonicals, responsive styling, theme support, descriptive figure captions, labelled or decorative SVGs, internal links and genuine HTTP 404 responses. No analytics, cookies, ranking promises, keyword tags or additional dependencies were added.

The initial audit found that HTTP served duplicate content with a 200 response. The existing Cloudflare Worker now permanently redirects HTTP and its alternate hosting address to the production HTTPS host, preserving paths and query strings. Native asset routing supplies trailing slash destinations; the Worker changes its temporary 307 responses to permanent 308 responses. Other asset responses, including downloads and 404s, pass through unchanged. This small handler runs before assets and therefore uses Worker requests. A native Cloudflare redirect rule could replace the HTTPS handler if zone rule editing access becomes available; the current CLI credentials only have zone read access.

## Verification and maintenance

```sh
npm run check
npm run build
npm test
# After publishing this exact build:
npm run test:live
```

The local tests check metadata uniqueness, language, one main heading, canonical URLs, deliberate indexability, sitemap coverage, JSON structure, breadcrumb and catalogue destinations, image dimensions, local links and fragment targets. Production checks compare every generated public HTML page, robots file, sitemap and preview image with the build without running client JavaScript. They also check missing pages and URL redirects. Use the explicit `TradingToolsVerification/1.0` User-Agent; Cloudflare has returned error 1010 to Python urllib's default User-Agent. A successful application request does not prove how Googlebot is treated.

When adding a standalone public page, add its canonical route to `src/pages/sitemap.xml.ts`. Tool routes are included automatically. Keep page paths ending in `/`, except assets. Preserve informative titles and accurate descriptions rather than adding repeated keywords. Use the actual licence and documented platform scope in visible content and metadata. Do not add reviews, prices, compatibility claims or a search action without supporting functionality and evidence.

## Account follow-up

Search Console ownership and indexation have not been verified. An owner should verify this hostname in [Google Search Console](https://search.google.com/search-console), submit [the sitemap](https://trading.cvladan.com/sitemap.xml), inspect representative URLs and monitor indexing and performance. No verification token was supplied and none was invented. These changes do not establish that Google has crawled or indexed the site, or guarantee ranking or a particular search appearance.

## References

Implementation follows Google's guidance on [canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [site names](https://developers.google.com/search/docs/appearance/site-names), [breadcrumbs](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb) and [noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing). The code descriptions use [Schema.org SoftwareSourceCode](https://schema.org/SoftwareSourceCode), rather than asserting the additional evidence needed by [Google's software application feature](https://developers.google.com/search/docs/appearance/structured-data/software-app). Sharing metadata follows the [Open Graph protocol](https://ogp.me/). Hosting behaviour follows [Cloudflare's HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/) and [redirect documentation](https://developers.cloudflare.com/workers/static-assets/redirects/).
