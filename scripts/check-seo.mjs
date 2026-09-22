import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import worker from '../worker.js';

const origin='https://trading.cvladan.com';
for(const address of ['http://trading.cvladan.com/tools/info/?example=1','https://trading-tools.example.workers.dev/tools/info/?example=1','http://localhost:8790/tools/info/?example=1']){
 const response=await worker.fetch(new Request(address),{ASSETS:{fetch(){assert.fail('Redirects must not fetch assets')}}});
 assert.equal(response.status,301);assert.equal(response.headers.get('location'),origin+'/tools/info/?example=1');
}
for(const status of [200,304,404,307]){
 const headers=status===307?{location:'/indicators/'}:{'x-test':'preserved'};
 const asset=new Response(null,{status,headers});
 const response=await worker.fetch(new Request(origin+'/indicators'),{ASSETS:{fetch:async()=>asset}});
 assert.equal(response.status,status===307?308:status);assert.deepEqual([...response.headers],[...asset.headers]);
 if(status!==307)assert.equal(response,asset);
}
const files=readdirSync('dist',{recursive:true}).filter(file=>file.endsWith('.html'));
const pages=new Map(files.map(file=>[file==='404.html'?'/404/':`/${file.replace(/index\.html$/,'')}`,readFileSync(join('dist',file),'utf8')]));
const titles=new Set(), descriptions=new Set(), indexable=[];
const attributes=tag=>Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([,key,value])=>[key,value]));
const metadata=html=>Object.fromEntries([...html.matchAll(/<meta\b[^>]*>/g)].map(([tag])=>{const a=attributes(tag);return [a.name||a.property,a.content]}));
const schemas=html=>[...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)].flatMap(([,json])=>JSON.parse(json)['@graph']);

for(const [path,html] of pages){
 const meta=metadata(html), title=html.match(/<title>(.*?)<\/title>/s)?.[1];
 const noindex=path==='/404/'||path==='/capture-guide/';
 assert(title&&!titles.has(title),`${path}: useful, unique title`);titles.add(title);
 assert(meta.description&&!descriptions.has(meta.description),`${path}: unique description`);descriptions.add(meta.description);
 assert.equal(meta.robots,noindex?'noindex, follow':undefined,`${path}: intentional indexability`);
 assert.match(html,/<html[^>]+lang="en-GB"/);
 assert.equal((html.match(/<h1[ >]/g)||[]).length,1);
 const canonical=[...html.matchAll(/<link\b[^>]*rel="canonical"[^>]*>/g)].map(([tag])=>attributes(tag).href);
 assert.deepEqual(canonical,path==='/404/'?[]:[origin+path],`${path}: canonical`);
 assert.equal(meta['og:url'],path==='/404/'?undefined:origin+path);
 assert.equal(meta['og:title'],title);assert.equal(meta['twitter:title'],title);
 assert.equal(meta['og:description'],meta.description);assert.equal(meta['twitter:description'],meta.description);
 assert.equal(meta['og:locale'],'en_GB');assert.equal(meta['og:site_name'],'Trading tools');
 assert.equal(meta['twitter:card'],'summary_large_image');
 assert.equal(meta['og:image'],origin+'/social-preview.png');assert.equal(meta['twitter:image'],meta['og:image']);
 assert(meta['og:image:alt']&&meta['twitter:image:alt']);
 assert.equal(meta['og:image:width'],'1200');assert.equal(meta['og:image:height'],'630');
 if(!noindex)indexable.push(origin+path);
 for(const [tag] of html.matchAll(/<img\b[^>]*>/g))assert('alt' in attributes(tag),`${path}: image alternative text`);
 for(const [tag] of html.matchAll(/<a\b[^>]*>/g)){
  const href=attributes(tag).href;
  if(!href||!href.startsWith('/')&&!href.startsWith('#'))continue;
  const url=new URL(href,origin+path), target=pages.get(url.pathname);
  if(target&&url.hash)assert(target.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`),`${path}: broken fragment ${href}`);
 }
 const data=schemas(html);
 assert(!/"(?:offers|aggregateRating|review)":/.test(JSON.stringify(data)),`${path}: no unsupported commercial or review claims`);
 if(path==='/')assert(data.some(item=>item['@type']==='WebSite'&&item.name==='Trading tools'&&item.url===origin+'/'));
 if(path.startsWith('/tools/')){
  const source=data.find(item=>item['@type']==='SoftwareSourceCode');assert(source,`${path}: source description`);
  assert.equal(source.url,origin+path);assert.match(source.codeRepository,/^https:\/\/github.com\/cvladan\/trading-tools\/blob\/main\/public\/sources\//);
  assert(['Pine Script','JavaScript'].includes(source.programmingLanguage));assert.equal(source.license,origin+'/licensing/');
  const crumbs=data.find(item=>item['@type']==='BreadcrumbList')?.itemListElement;assert.equal(crumbs?.length,2);
  assert.deepEqual(crumbs.map(item=>item.position),[1,2]);assert.equal(crumbs[1].item,origin+path);
  for(const crumb of crumbs)assert(pages.has(new URL(crumb.item).pathname));
  assert.match(html,/<nav class="breadcrumbs" aria-label="Breadcrumb">/);
 }
 if(['/indicators/','/userscripts/'].includes(path)){
  const collection=data.find(item=>item['@type']==='CollectionPage');assert(collection);assert.equal(collection.url,origin+path);
  const items=collection.mainEntity.itemListElement;
  assert.equal(new Set(items.map(item=>item.url)).size,items.length);
  for(const [index,item] of items.entries()){
   assert.equal(item.position,index+1);const toolPath=new URL(item.url).pathname;
   assert(html.includes(`href="${toolPath}"`));assert(pages.has(toolPath));
  }
 }
}
const sitemap=readFileSync('dist/sitemap.xml','utf8');
assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(([,url])=>url).sort(),indexable.sort(),'Sitemap contains every indexable page once');
assert.match(readFileSync('dist/robots.txt','utf8'),/Sitemap: https:\/\/trading.cvladan.com\/sitemap.xml/);
const image=readFileSync('dist/social-preview.png');assert.equal(image.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(image.readUInt32BE(16),1200);assert.equal(image.readUInt32BE(20),630);
console.log(`Passed SEO: ${pages.size} pages, ${indexable.length} sitemap URLs, metadata, structured data, fragments and social image.`);

if(process.argv.includes('--live')){
 const request=url=>fetch(url,{redirect:'manual',headers:{'User-Agent':'TradingToolsVerification/1.0'},signal:AbortSignal.timeout(30000)});
 for(const [path,html] of pages){
  if(path==='/404/')continue;
  const response=await request(origin+path);assert.equal(response.status,200,path);assert(!response.headers.get('x-robots-tag')?.includes('noindex'),path);
  assert.equal(await response.text(),html,`${path}: production matches build`);
 }
 for(const path of ['/robots.txt','/sitemap.xml','/social-preview.png']){
  const response=await request(origin+path);assert.equal(response.status,200,path);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),readFileSync('dist'+path),`${path}: production matches build`);
 }
 for(const path of ['/seo-verification-missing/','/tools/seo-verification-missing/']){
  const response=await request(origin+path);assert.equal(response.status,404,path);
  const html=await response.text();assert.equal(metadata(html).robots,'noindex, follow');assert(!html.includes('rel="canonical"'));
 }
 for(const path of ['/indicators','/indicators/index.html','/tools/info']){
  const response=await request(origin+path);assert([301,307,308].includes(response.status),path);
  assert.equal(new URL(response.headers.get('location'),origin).href,origin+(path.endsWith('/index.html')?path.replace('index.html',''):path+'/'));
 }
 const response=await request('http://trading.cvladan.com/tools/info/?seo-check=1');
 assert([301,308].includes(response.status),'HTTP must redirect permanently to HTTPS');
 assert.equal(response.headers.get('location'),origin+'/tools/info/?seo-check=1');
 console.log('Passed production: HTML and assets match, redirects preserve paths and queries, missing pages return HTTP 404.');
}
