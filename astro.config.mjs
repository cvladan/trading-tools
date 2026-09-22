import { defineConfig } from 'astro/config';
export default defineConfig({ site: 'https://trading.cvladan.com', output: 'static', trailingSlash: 'always', devToolbar: { enabled: false }, markdown: { shikiConfig: { themes: { dark: 'github-dark', light: 'github-light' }, defaultColor: 'dark' } } });
