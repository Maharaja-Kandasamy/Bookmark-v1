/* GSRS Visuals — vanilla JavaScript. No network calls or persistent storage. */
(() => {
'use strict';
const key='__gsrsVisualsV1';
if(window[key]){window[key].refresh();return;}
const scope=document.querySelector('[data-testid="newrecords"]');
if(!scope){console.warn('[GSRS] New Records not found.');return;}
const fields=[['Store Name','STORE NAME'],['Store Number','STORE NUMBER'],['PA Line 1','PA LINE1'],['PA City Name','PA CITY NAME'],['PA State Code','PA STATE CODE'],['Postal Code','PA POSTAL CODE'],['Area Code','PHONE AREA CODE'],['Phone Number','PHONE NUMBER']];
const warned=new Set();
const warn=s=>{if(!warned.has(s)){warned.add(s);console.warn('[GSRS] '+s);}};
const header=s=>s.toUpperCase().replace(/\b(RS|SL)\b/g,'').replace(/[^A-Z0-9]/g,'');
// Numeric segments lose leading zeros; punctuation/spacing/case are insignificant.
const norm=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[’']/g,'').replace(/[^A-Z0-9]+/g,' ').replace(/\d+/g,n=>n.replace(/^0+(?=\d)/,'')).trim();
const blank=s=>!s.replace(/[\s\u200b\ufeff]/g,'');
const words={STREET:'ST',ROAD:'RD',AVENUE:'AVE',BOULEVARD:'BLVD',DRIVE:'DR',LANE:'LN',COURT:'CT',CIRCLE:'CIR',TERRACE:'TER',PLACE:'PL',PARKWAY:'PKWY',HIGHWAY:'HWY',ROUTE:'RTE',NORTH:'N',SOUTH:'S',EAST:'E',WEST:'W',NORTHEAST:'NE',NORTHWEST:'NW',SOUTHEAST:'SE',SOUTHWEST:'SW',APARTMENT:'UNIT',APT:'UNIT',SUITE:'UNIT',STE:'UNIT'};
const states='AL:ALABAMA|AK:ALASKA|AZ:ARIZONA|AR:ARKANSAS|CA:CALIFORNIA|CO:COLORADO|CT:CONNECTICUT|DE:DELAWARE|DC:DISTRICT OF COLUMBIA|FL:FLORIDA|GA:GEORGIA|HI:HAWAII|ID:IDAHO|IL:ILLINOIS|IN:INDIANA|IA:IOWA|KS:KANSAS|KY:KENTUCKY|LA:LOUISIANA|ME:MAINE|MD:MARYLAND|MA:MASSACHUSETTS|MI:MICHIGAN|MN:MINNESOTA|MS:MISSISSIPPI|MO:MISSOURI|MT:MONTANA|NE:NEBRASKA|NV:NEVADA|NH:NEW HAMPSHIRE|NJ:NEW JERSEY|NM:NEW MEXICO|NY:NEW YORK|NC:NORTH CAROLINA|ND:NORTH DAKOTA|OH:OHIO|OK:OKLAHOMA|OR:OREGON|PA:PENNSYLVANIA|RI:RHODE ISLAND|SC:SOUTH CAROLINA|SD:SOUTH DAKOTA|TN:TENNESSEE|TX:TEXAS|UT:UTAH|VT:VERMONT|VA:VIRGINIA|WA:WASHINGTON|WV:WEST VIRGINIA|WI:WISCONSIN|WY:WYOMING|PR:PUERTO RICO'.split('|').map(s=>s.split(':'));
function canonical(s,f){let v=norm(s);if(f===2)v=v.split(' ').map(w=>words[w]||w).join(' ');if(f===4){const state=states.find(([c,n])=>[c,n,c+' '+n].includes(v));if(state)v=state[0];}return v.replace(/ /g,'');}
function compare(p,c,f){
 if(blank(p)||blank(c))return null;
 const a=canonical(p,f),b=canonical(c,f);if(!a||!b)return null;if(a===b)return 'exact';
 // Address: only leading house-number changes are Partial. Route/unit differences are No Match.
 if(f===2){const re=/^\d+[A-Z]?\b/,x=norm(p),y=norm(c);return re.test(x)&&re.test(y)&&canonical(x.replace(re,''),f)===canonical(y.replace(re,''),f)?'partial':'none';}
 // Names/cities: conservative whole-word containment. No generic fuzzy scoring.
 if(f===0||f===3){const x=' '+norm(p)+' ',y=' '+norm(c)+' ';if(Math.min(a.length,b.length)>=3&&(x.includes(y)||y.includes(x)))return 'partial';}
 if(f===5&&/^\d+$/.test(a)&&/^\d+$/.test(b)&&((a.length===5&&b.length===9&&b.startsWith(a))||(b.length===5&&a.length===9&&a.startsWith(b))))return 'partial';
 return 'none';
}
const style=document.createElement('style');
style.textContent=`
[data-gsrs-match="exact"]{background:#dcfce7!important;color:#14532d!important;box-shadow:inset 4px 0 #16a34a!important}
[data-gsrs-match="partial"]{background:#fef3c7!important;color:#78350f!important;box-shadow:inset 4px 0 #f59e0b!important}
[data-gsrs-match="none"]{background:#fee2e2!important;color:#7f1d1d!important;box-shadow:inset 4px 0 #dc2626!important}
#gsrs-visual-panel{position:fixed;right:16px;bottom:16px;z-index:2147483647;background:white;color:#172033;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 8px 32px #0003;padding:14px;font:13px/1.45 Arial,sans-serif;width:365px;max-width:calc(100vw - 60px);max-height:70vh;overflow:auto;text-align:left}
#gsrs-visual-panel table{border-collapse:collapse;width:100%;font:inherit;color:inherit}
#gsrs-visual-panel th,#gsrs-visual-panel td{padding:4px;text-align:right;border-bottom:1px solid #e2e8f0;background:white;color:#172033}
#gsrs-visual-panel th:first-child,#gsrs-visual-panel td:first-child{text-align:left}
#gsrs-visual-panel button{font:inherit;margin:5px 5px 5px 0;padding:5px 8px;border:1px solid #94a3b8;border-radius:5px;background:#f8fafc;color:#172033;cursor:pointer}`;
document.head.append(style);
const panel=document.createElement('aside');panel.id='gsrs-visual-panel';panel.setAttribute('aria-label','GSRS field comparison');
panel.innerHTML='<strong>GSRS field comparison</strong><div>Green: Exact · Amber: Partial · Red: No Match</div><div data-summary></div><table><thead><tr><th>Field</th><th>Exact</th><th>Partial</th><th>No Match</th></tr></thead><tbody></tbody></table><div data-status role="status" aria-live="polite"></div><button data-size>Show 100 (optional)</button><button data-refresh>Recheck</button><button data-close>Remove</button><div style="font-size:11px">Current page · child values only · blanks excluded</div>';
document.body.append(panel);
const status=s=>panel.querySelector('[data-status]').textContent=s;
let stopped=false,timer,busy=false;
const table=()=>scope.querySelector('[data-testid="newrecords-table"] table');
const blocks=c=>c?Array.from(c.children).filter(e=>e.classList.contains('childCellColor')):[];
function refresh(){
 if(stopped)return;const t=table();if(!t){warn('New Records table unavailable.');status('New Records table unavailable.');return;}
 const heads=Array.from(t.querySelector('thead tr')?.children||[]);
 const map=fields.map(([,n])=>{const found=heads.map((h,i)=>header(h.textContent)===header(n)?i:-1).filter(i=>i>=0);if(found.length!==1){warn('Missing or ambiguous header: '+n);return -1;}return found[0];});
 const counts=fields.map(()=>({exact:0,partial:0,none:0}));let candidates=0,skipped=0;
 t.querySelectorAll('[data-gsrs-match]').forEach(e=>e.removeAttribute('data-gsrs-match'));
 const rows=t.querySelectorAll('tbody > tr.newRecordParent');
 rows.forEach(r=>{
  const cells=Array.from(r.children),n=Math.max(0,...cells.map(c=>blocks(c).length));candidates+=n;
  // All banners are supported: compare against this record's own parent, never a hard-coded chain.
  if(!cells[map[0]]||blank(cells[map[0]].querySelector('.padding-10_1_5-margin')?.textContent||''))warn('Missing banner/store name; available fields still compared independently.');
  map.forEach((index,f)=>{if(index<0)return;const c=cells[index],p=c?.querySelector('.padding-10_1_5-margin'),children=blocks(c);
   if(!p||children.length!==n){warn('Incomplete child alignment for '+fields[f][0]+'; affected field skipped.');return;}
   children.forEach(b=>{const result=compare(p.textContent,b.textContent,f);if(!result){skipped++;return;}b.setAttribute('data-gsrs-match',result);counts[f][result]++;});
  });
 });
 panel.querySelector('tbody').replaceChildren(...fields.map(([label],i)=>{const r=document.createElement('tr');[label,counts[i].exact,counts[i].partial,counts[i].none].forEach(v=>{const c=document.createElement('td');c.textContent=v;r.append(c);});return r;}));
 panel.querySelector('[data-summary]').textContent=`${rows.length} parents · ${candidates} children · ${skipped} blank comparisons skipped`;
 if(!busy)status(map.includes(-1)?'Some fields unavailable; see console warnings.':'Active on this page.');
}
// Relative XPath avoids repeated demo-simple-select IDs and unrelated pagination controls.
const xp=(path,root=scope)=>document.evaluate(path,root,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null).singleNodeValue;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(check,timeout=8000){const end=Date.now()+timeout;while(!stopped&&Date.now()<end){const v=check();if(v)return v;await delay(100);}throw Error(stopped?'Stopped.':'Timed out waiting for page update.');}
async function show100(){
 if(busy||stopped)return;busy=true;const button=panel.querySelector('[data-size]');button.disabled=true;let watcher;
 try{
  const control=xp('.//*[@data-testid="rows-perpage"]//*[@role="button"]');
  if(!control)throw Error('Page-size dropdown not found.');
  if(control.textContent.trim()==='100'){status('Page size already 100.');return;}
  if(control.getAttribute('aria-disabled')==='true')throw Error('Page-size dropdown disabled.');
  status('Opening page-size menu…');
  // MUI opens on mousedown. Clicking its option triggers its own React change handler.
  control.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0}));control.click();
  const option=await wait(()=>xp('//*[@role="listbox"]//*[@role="option" and (@data-value="100" or normalize-space(.)="100")]',document),5000);
  let updated=false,last=performance.now();const before=table(),text=before?.textContent;
  watcher=new MutationObserver(records=>{if(records.some(r=>{
   const el=r.target.nodeType===1?r.target:r.target.parentElement;
   return el?.closest('[data-testid="newrecords-table"],[data-testid="pagination-count-information"]')||[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&(n.matches?.('[data-testid="newrecords-table"]')||n.querySelector?.('[data-testid="newrecords-table"]')));
  })){updated=true;last=performance.now();}});
  watcher.observe(scope,{childList:true,subtree:true,characterData:true});
  status('Waiting for results to reload…');option.click();
  await wait(()=>{const t=table(),selected=xp('.//*[@data-testid="rows-perpage"]//*[@role="button"]');const loading=Array.from(scope.querySelectorAll('[role="progressbar"],.custom-loader')).some(e=>e.getClientRects().length);return selected?.textContent.trim()==='100'&&(updated||t!==before||t?.textContent!==text)&&t?.querySelector('tbody > tr.newRecordParent')&&!loading&&performance.now()-last>900;},30000);
  status('Page size set to 100; results updated.');
 }catch(e){warn(e.message);status(e.message+' Select 100 manually, then click Recheck.');}
 finally{watcher?.disconnect();busy=false;button.disabled=false;const message=panel.querySelector('[data-status]').textContent;refresh();status(message);}
}
const observer=new MutationObserver(()=>{if(busy||stopped)return;clearTimeout(timer);timer=setTimeout(refresh,300);});
observer.observe(scope,{childList:true,subtree:true,characterData:true});
function remove(){stopped=true;clearTimeout(timer);observer.disconnect();scope.querySelectorAll('[data-gsrs-match]').forEach(e=>e.removeAttribute('data-gsrs-match'));panel.remove();style.remove();delete window[key];}
panel.querySelector('[data-size]').onclick=show100;panel.querySelector('[data-refresh]').onclick=refresh;panel.querySelector('[data-close]').onclick=remove;
window[key]={refresh,remove};refresh();
})();
