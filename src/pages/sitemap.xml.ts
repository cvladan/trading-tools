import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
export const GET: APIRoute = async () => {
 const paths=['','indicators/','userscripts/','userscripts/tradingview/','userscripts/trade-nation/','about/','licensing/','install/',...(await getCollection('tools')).map(t=>`tools/${t.id}/`)];
 return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(p=>`<url><loc>https://trading.cvladan.com/${p}</loc></url>`).join('')}</urlset>`,{headers:{'Content-Type':'application/xml'}});
};
