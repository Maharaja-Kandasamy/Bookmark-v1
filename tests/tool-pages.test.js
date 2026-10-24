const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('each tool has a dedicated page, its own exact bookmark and a how-it-works page',()=>{
 for(const [tool,payload,logo] of [['picker','picker-bookmark-v1.min.js','picker-logo.png'],['gsrs-visuals','gsrs-bookmarklet.txt','visuals-logo.png']]){
  const html=read(tool+'.html'),help=read(tool+'-how-it-works.html');
  assert(html.includes(read(payload).trim()));
  assert(html.includes('assets/'+logo));
  assert(html.includes(tool+'-how-it-works.html'));
  assert(html.includes('data-copy-bookmark'));
  assert(help.includes('href="'+tool+'.html"'));
  assert(help.includes('assets/'+logo));
  assert(!/Import with|import link/.test(html+help));
 }
});
test('overview links to both tools and their separate guides at the new repository',()=>{
 const html=read('index.html');
 for(const route of ['picker.html','picker-how-it-works.html','gsrs-visuals.html','gsrs-visuals-how-it-works.html'])assert(html.includes('href="'+route+'"'),route);
 assert(html.includes('https://github.com/Maharaja-Kandasamy/Bookmark-v1'));
 assert(!html.includes('github.com/Maharaja-Kandasamy/Picker-Bookmark-v1'));
});
