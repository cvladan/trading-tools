export const repository = 'https://github.com/cvladan/trading-tools';
export const commercialContact = `${repository}/issues/new?title=Commercial%20licence%20enquiry`;
export const sourceUrl = (filename: string) => `${repository}/blob/main/public/sources/${encodeURIComponent(filename)}`;
export const groupLabel = (group: string) => group === 'indicator' ? 'Indicator' : group === 'tradingview' ? 'TradingView browser' : 'Trade Nation';
