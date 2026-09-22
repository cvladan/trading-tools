import type { CollectionEntry } from 'astro:content';
export const repository = 'https://github.com/cvladan/trading-tools';
export const commercialContact = `${repository}/issues/new?title=Commercial%20licence%20enquiry`;
export const sourceUrl = (filename: string) => `${repository}/blob/main/public/sources/${encodeURIComponent(filename)}`;
export const groupLabel = (group: string) => group === 'indicator' ? 'Indicator' : group === 'tradingview' ? 'TradingView browser' : group === 'statistics' ? 'Trading Statistics' : 'Trade Nation';

export const catalogueSchema = (name: string, tools: CollectionEntry<'tools'>[], path: string, site: URL) => ({
  '@type': 'CollectionPage', name, url: new URL(path, site).href, inLanguage: 'en-GB',
  mainEntity: { '@type': 'ItemList', itemListElement: [...tools].sort((a,b)=>a.data.order-b.data.order).map((tool,index)=>({ '@type': 'ListItem', position: index+1, name: tool.data.name, url: new URL(`/tools/${tool.id}/`, site).href })) }
});
