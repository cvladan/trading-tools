import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
const root=resolve('dist');
const files=readdirSync(root,{recursive:true}).filter(f=>f.endsWith('.html'));
const catalogue=readdirSync('src/content/tools').filter(f=>f.endsWith('.md')).map(file=>({id:file.slice(0,-3),...JSON.parse(readFileSync(join('src/content/tools',file),'utf8').split('---')[1])}));
assert.deepEqual(files.filter(f=>f.startsWith('tools/')).sort(),catalogue.map(t=>`tools/${t.id}/index.html`).sort(),'Each catalogue entry must have one tool page');
const sourceFiles=readdirSync('public/sources');
assert.deepEqual(sourceFiles.filter(f=>f.endsWith('.pine')||f.endsWith('.user.js')).sort(),catalogue.map(t=>t.source).sort(),'Published sources must match the catalogue');
assert(!sourceFiles.some(f=>/SVKO Dev|Custom Sound/.test(f)));
const licence=readFileSync('LICENSE','utf8');
assert.equal(readFileSync(join(root,'licences/SVKO-1.0.txt'),'utf8'),licence,'The published licence must match LICENSE');
for(const tool of catalogue){
 assert.equal(tool.licence,'SVKO 1.0',`${tool.id}: current licence metadata`);
 const source=readFileSync(join(root,'sources',tool.source),'utf8');
 assert(source.includes('SVKO Personal Use and Commercial Licence 1.0.'),`${tool.id}: licence notice`);
 assert(source.includes('https://trading.cvladan.com/licences/SVKO-1.0.txt'),`${tool.id}: full terms`);
}
assert.match(readFileSync(join(root,'licensing/index.html'),'utf8'),/Earlier valid licence grants remain effective/);
const mainLinks=[['/indicators/','TradingView Indicators'],['/userscripts/tradingview/','TradingView User Scripts'],['/userscripts/trade-nation/','Trade Nation User Scripts'],['/tools/trading-statistics/','Trading Statistics']];
for(const file of files){
 const html=readFileSync(join(root,file),'utf8');
 const menu=html.match(/<nav aria-label="Main navigation">([\s\S]*?)<\/nav>/)?.[1];
 assert(menu,`${file}: main navigation`);
 const links=[...menu.matchAll(/<a href="([^"]+)"([^>]*)>([^<]+)<\/a>/g)];
 assert.deepEqual(links.map(([,href,,label])=>[href,label]),mainLinks,`${file}: exact main menu labels and order`);
 const tool=catalogue.find(t=>file===`tools/${t.id}/index.html`);
 const section=tool?{indicator:0,tradingview:1,broker:2,statistics:3}[tool.group]:mainLinks.findIndex(([href])=>file===`${href.slice(1)}index.html`);
 for(let index=0;index<links.length;index++)assert.equal(/aria-current="(?:page|true)"/.test(links[index][2]),index===section,`${file}: current navigation section`);
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
  assert.match(html,/Company and work use/);
  assert.match(html,/href="\/licensing\/"/);
  assert.match(html,/Why I built it/);assert.match(html,/How it solves the problem/);
  const tool=catalogue.find(t=>file===`tools/${t.id}/index.html`);
  if(tool.diagram){assert(html.includes(tool.diagram));assert(!html.includes('Real capture needed:'));assert(!/<div class="visual-stage">\s*<\/div>/.test(html),`${file}: diagram must contain an explanation`);}
  else{assert.match(html,/Illustrative mockup, not actual product output/);assert.match(html,/Real capture needed:/);}
  assert.match(html,/github.com\/cvladan\/trading-tools\/blob\/main\/public\/sources\//);
 }
}
const volumePage=readFileSync(join(root,'tools/real-volume/index.html'),'utf8');
const volumeFigures=[...volumePage.matchAll(/<figure[^>]*data-market="(stocks|indices)"[^>]*>([\s\S]*?)<\/figure>/g)];
assert.deepEqual(volumeFigures.map(match=>match[1]),['stocks','indices'],'Real Volume needs separate stock and index diagrams');
for(const [,market,figure] of volumeFigures){
 for(const label of ['External volume columns','CFD chart price','Real VWAP'])assert(figure.includes(label),`${market}: complete volume flow`);
 assert.equal(figure.includes('Weighted activity proxy'),market==='indices','Only the index example uses weighted futures and ETF activity');
}
const stats=readFileSync(join(root,'tools/trading-statistics/index.html'),'utf8');
assert.equal(catalogue.find(t=>t.id==='trading-statistics').group,'statistics','Statistics is independent of platform catalogues');
for(const [platform,group] of [['tradingview','tradingview'],['trade-nation','broker']]){
 const html=readFileSync(join(root,`userscripts/${platform}/index.html`),'utf8');
 const cards=[...html.matchAll(/<h3><a href="\/tools\/([^/]+)\//g)].map(match=>match[1]);
 assert.deepEqual(cards.sort(),catalogue.filter(t=>t.group===group).map(t=>t.id).sort(),`${platform}: only the selected platform's tools`);
 assert(!cards.includes('trading-statistics'),'Statistics must not be a platform catalogue card');
}
assert.match(stats,/Support for IG.com is planned but is not yet implemented/);
assert.match(stats,/<a href="\/">Home<\/a>/);
assert.match(stats,/There is no IG importer/);
assert.match(readFileSync(join(root,'userscripts/index.html'),'utf8'),/native TradingView Desktop app/);
assert.match(readFileSync(join(root,'tools/info/index.html'),'utf8'),/has not reviewed or tested their mobile output/);
assert(existsSync(join(root,'sitemap.xml')));
const noticeScript=readFileSync('src/scripts/ai-notice.js','utf8');
assert(readFileSync(join(root,'index.html'),'utf8').split('</head>')[0].includes(noticeScript),'Notice visibility is decided inline before the body renders');
const noticeKey='trading-tools-ai-notice';
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}};
const blocked={getItem(){throw Error('Storage unavailable')},setItem(){throw Error('Storage unavailable')}};
const visit=(localStorage,sessionStorage)=>{
 const document={documentElement:{dataset:{}},addEventListener(type,listener){assert.equal(type,'click');this.click=listener}};
 runInNewContext(noticeScript,{document,localStorage,sessionStorage});
 return {visible:()=>document.documentElement.dataset.aiNotice==='show',close:()=>document.click({target:{closest:()=>true}})};
};
const persistent=storage();
for(let sessionNumber=1;sessionNumber<=4;sessionNumber++){
 const session=storage();
 for(let page=0;page<3;page++){
  assert.equal(visit(persistent,session).visible(),sessionNumber<=3,'Visible during the first three sessions only');
  assert.equal(persistent.getItem(`${noticeKey}-visits`),String(sessionNumber),'Navigation and reload must not count extra visits');
 }
}
const dismissed=storage(),currentSession=storage(),notice=visit(dismissed,currentSession);
notice.close();
assert(!notice.visible(),'Dismiss immediately');
assert(!visit(dismissed,currentSession).visible(),'Dismissal survives navigation and reload');
assert(!visit(dismissed,storage()).visible(),'Dismissal survives a new session');
for(const [local,session] of [[blocked,blocked],[storage(),blocked],[blocked,storage()]]){
 const fallback=visit(local,session);
 assert(fallback.visible(),'Storage failure leaves a readable notice');
 fallback.close();
 assert(!fallback.visible(),'Close still works when storage is blocked');
}
for(const invalid of ['garbage','-1','Infinity','1.5']){
 const local=storage();local.setItem(`${noticeKey}-visits`,invalid);
 assert(visit(local,storage()).visible(),'Invalid counts start a fresh visit');
 assert.equal(local.getItem(`${noticeKey}-visits`),'1');
}
console.log('Passed: AI notice session counting, persistent dismissal, storage fallback and early rendering.');
console.log(`Passed: ${files.length} pages, all local links, ${catalogue.length} tool pages, scope, disclosures and source routes.`);
