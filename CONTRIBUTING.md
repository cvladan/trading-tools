# Contributing

Use GitHub Issues for a reproducible bug or practical improvement, and pull requests for a proposed change.

Name the affected tool or page, describe the expected and actual behaviour, and include the relevant browser, manager or chart context. Remove account identifiers, credentials and private transaction data from screenshots and examples. Synthetic examples are preferred.

Keep public prose in British English. Preserve attribution and licence notices. Do not imply that a successful site build validates Pine calculations, live broker actions or financial performance. Changes to distributed tools need their own appropriate validation; test order controls only in a demo environment.

For website changes, run:

```sh
npm run check
npm run build
npm test
```

Check narrow phone and desktop layouts, keyboard access and reduced motion. Keep explanatory diagrams as diagrams. Label interface mockups until replaced with verified real captures. Source files use the licences listed in `public/sources/LICENSING.md`.
