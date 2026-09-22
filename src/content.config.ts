import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';
const tools = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/tools' }),
  schema: z.object({
    title: z.string(), name: z.string(), group: z.enum(['indicator', 'tradingview', 'broker']),
    summary: z.string(), label: z.string(), order: z.number(), markets: z.array(z.string()),
    visual: z.string(), diagram: z.string().optional(), capture: z.string(), source: z.string(), licence: z.string(),
    publication: z.string().optional(), install: z.array(z.string()), related: z.array(z.string()),
  }),
});
export const collections = { tools };
