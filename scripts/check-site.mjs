import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
const root=resolve('dist');
const files=readdirSync(root,{recursive:true}).filter(f=>f.endsWith('.html'));
assert.equal(files.length,17,'Expected home, two catalogues, ten tools, about, install, capture guide and 404');
const sourceFiles=readdirSync('public/sources');
assert.equal(sourceFiles.filter(f=>f.endsWith('.pine')).length,4);
assert.equal(sourceFiles.filter(f=>f.endsWith('.user.js')).length,6);
assert(!sourceFiles.some(f=>/SVKO Dev|Custom Sound/.test(f)));
for(const file of files){
 const html=readFileSync(join(root,file),'utf8');
 assert.match(html,/<html[^>]+lang="en-GB"/,`${file}: language`);
 assert.equal((html.match(/<h1[ >]/g)||[]).length,1,`${file}: one page heading`);
 assert(!/Pending confirmation|TODO|SVKO Dev|Custom Sound/.test(html),`${file}: internal or excluded content`);
 for(const anchor of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g))assert(!/<button\b/.test(anchor[1]),`${file}: button nested in link`);
 for(const match of html.matchAll(/(?:href|src)="([^"#]+)(?:#[^"]*)?"/g)){
  const value=match[1].replaceAll('&amp;','&');
  if(!value.startsWith('/')||value.startsWith('//'))continue;
  let path=join(root,decodeURIComponent(value.split(/[?#]/)[0]));
  if(existsSync(path)&&statSync(path).isDirectory())path=join(path,'index.html');
  assert(existsSync(path),`${file}: broken local link ${value}`);
 }
 if(file.startsWith('tools/')){
  assert.match(html,/Why I built it/);assert.match(html,/How it solves the problem/);
  assert.match(html,/Illustrative mockup, not actual product output/);assert.match(html,/Real capture needed:/);
  assert.match(html,/github.com\/cvladan\/trading-tools\/blob\/main\/public\/sources\//);
 }
}
const stats=readFileSync(join(root,'tools/trading-statistics/index.html'),'utf8');
assert.match(stats,/There is no IG importer/);
assert.match(readFileSync(join(root,'userscripts/index.html'),'utf8'),/native TradingView Desktop app/);
assert.match(readFileSync(join(root,'tools/info/index.html'),'utf8'),/has not reviewed or tested their mobile output/);
assert(existsSync(join(root,'sitemap.xml')));
console.log(`Passed: ${files.length} pages, all local links, 10 tool pages, scope, disclosures and source routes.`);
