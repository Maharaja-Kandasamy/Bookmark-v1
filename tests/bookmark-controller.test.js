const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.resolve(__dirname, '../src/bookmark-controller.js');

function setup(overrides = {}) {
  const states = [];
  let state = { status: 'ready', results: [], observations: [] };
  const store = { get: () => state, set: patch => { state = { ...state, ...patch }; states.push(state); return state; }, destroy: () => { state = null; } };
  const source = { slId: 'SOURCE', bannerName: 'Zone Appliance', storeNumber: '12', address: '10 Main St', city: 'Austin', state: 'TX', zip: '78701', phone: '5125551212' };
  const dependencies = {
    PickerDuplicateEngine: {
      normalizeZip: require('../vendor/duplicate-engine').normalizeZip,
      createSearchPlan: () => [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }],
      consolidateCandidates: (_source, rows) => rows.map(x => x.candidate)
    },
    PickerGsrsTableAdapter: { extractFromDocument: () => ({ profile: 'storeView', source, candidates: [{ slId: 'A' }], sourceRowCount: 2, initialCandidateCount: 1 }) },
    PickerManualMatchAdapter: { execute: async query => ({ status: 'complete', rows: [{ slId: query.id }] }) },
    PickerRunController: { createRunController: ({ adapter, onState }) => ({ start: async plan => { const observations=[]; for (const query of plan) observations.push({ queryId: query.id, ...(await adapter(query, { signal: new AbortController().signal })) }); const result={status:'completed',observations,progress:2,total:2}; onState(result); return result; }, pause(){}, resume(){}, cancel(){ this.cancelled=true; }, isActive(){ return false; } }) },
    ...overrides
  };
  const context = { globalThis: dependencies, AbortController, URL, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context);
  const lifecycle = { disposed: false, dispose(){ this.disposed=true; } };
  const win = { open: () => ({}) };
  return { controller: context.globalThis.PickerBookmarkController.create({ document: {}, window: win, store, lifecycle }), store, states, lifecycle, win };
}

test('controller scans current table and consolidates sequential results', async () => {
  const { controller, store } = setup();
  const scan = controller.scan();
  assert.equal(scan.profile, 'storeView');
  const result = await controller.run();
  assert.equal(result.status, 'completed');
  assert.deepEqual(Array.from(store.get().results, x => x.slId), ['one', 'two']);
});

test('destroy cancels work before disposing lifecycle and state', () => {
  const order = [];
  const RunController = { createRunController: () => ({ start: ()=>new Promise(()=>{}), cancel:()=>order.push('cancel'), isActive:()=>true }) };
  const { controller, lifecycle, store } = setup({ PickerRunController: RunController });
  const originalDispose = lifecycle.dispose.bind(lifecycle);
  lifecycle.dispose = () => { order.push('dispose'); originalDispose(); };
  controller.scan();
  void controller.run();
  controller.destroy();
  assert.deepEqual(order, ['cancel', 'dispose']);
  assert.equal(store.get(), null);
});

test('blocked outbound link reports false without changing session state', () => {
  const { controller, win } = setup();
  win.open = () => null;
  assert.equal(controller.openExternal('https://www.google.com/maps'), false);
});

test('run rescans the current record and clears previous extraction on failure', async () => {
  let found = {profile:'storeView',source:{slId:'OLD',bannerName:'Old'},candidates:[]};
  const {controller,store}=setup({PickerGsrsTableAdapter:{extractFromDocument:()=>found}});
  controller.scan();
  found={profile:'storeView',source:{slId:'NEW',bannerName:'New'},candidates:[]};
  await controller.run();
  assert.equal(store.get().source.slId,'NEW');
  found={error:'source-table-not-found'};
  controller.refresh();
  assert.equal(store.get().source,null);
  assert.equal(store.get().results.length,0);
  assert.equal((await controller.run()).status,'error');
});

test('changing source cancels an old run and ignores its late updates', async () => {
  let found={profile:'storeView',source:{slId:'OLD',bannerName:'Old'},candidates:[]};
  let complete, publish, cancelled=false;
  const {controller,store}=setup({
    PickerGsrsTableAdapter:{extractFromDocument:()=>found},
    PickerRunController:{createRunController:({onState})=>({
      start:()=>new Promise(resolve=>{complete=resolve;publish=onState;}),
      cancel:()=>{cancelled=true;},isActive:()=>true
    })}
  });
  const running=controller.run();
  found={profile:'retailSync',source:{slId:'NEW',bannerName:'New'},candidates:[]};
  controller.refresh();
  publish({status:'completed',results:[{slId:'STALE'}]});
  complete({status:'completed',observations:[]});
  assert.equal((await running).status,'cancelled');
  assert.equal(cancelled,true);
  assert.equal(store.get().source.slId,'NEW');
  assert.equal(store.get().results.length,0);
  assert.equal(store.get().status,'ready');
});

test('missing Manual screen shows activation warning and clears it when source becomes available', async () => {
 let found={error:'source-table-not-found'};
 const {controller,store}=setup({PickerGsrsTableAdapter:{extractFromDocument:()=>found}});
 controller.scan();
 assert.equal(store.get().diagnostic,'You need to be in the Manual screen to activate me.');
 assert.equal(store.get().diagnosticCode,'source-table-not-found');
 assert.equal(store.get().source,null);
 assert.equal((await controller.run()).status,'error');
 found={profile:'storeView',source:{slId:'NEW',bannerName:'Acme'},candidates:[]};
 controller.refresh();
 assert.equal(store.get().diagnostic,'');
 assert.equal(store.get().diagnosticCode,'');
 assert.equal(store.get().status,'ready');
});

test('separate searches run only their own group while All Search includes every query', async () => {
 const types=['banner-exact-zip','banner-wildcard-zip','address-city','address-zip','phone','store-banner','banner-state','address-state','banner-city'];
 const {controller}=setup({PickerDuplicateEngine:{
  normalizeZip: require('../vendor/duplicate-engine').normalizeZip,
  createSearchPlan:()=>types.map(type=>({id:type,type})),
  consolidateCandidates:()=>[]
 }});
 for(const [group,expected] of [['banner',[...types.slice(0,2),'banner-city']],['address',[types[2],types[3],'address-state']],['phone',['phone']],['store',['store-banner']],['bannerState',['banner-state']],['all',types]]){
  const result=await controller.run(group);
  assert.deepEqual(Array.from(result.plan,q=>q.type),expected);
  assert.deepEqual(Array.from(result.observations,q=>q.queryId),expected);
 }
});

test('source ZIP displayed by the bot is corrected without changing the extracted record', () => {
 const source={slId:'A',bannerName:'Acme',zip:'987-7678'};
 const {controller,store}=setup({PickerGsrsTableAdapter:{extractFromDocument:()=>({profile:'storeView',source,candidates:[]})}});
 controller.scan();
 assert.equal(store.get().source.zip,'00987');
 assert.equal(source.zip,'987-7678');
});

test('final Links search is awaited before completing and retains ranked results on discovery failure',async()=>{
 for(const status of ['complete','incomplete']){
 let submitted;
 const {controller,store}=setup({
 PickerDuplicateEngine:{normalizeZip:require('../vendor/duplicate-engine').normalizeZip,createSearchPlan:()=>[{id:'one'}],consolidateCandidates:()=>[{candidate:{slId:'0067788'}}],getTopTdIds:()=>['0067788']},
 PickerBookmarkLinks:{execute:async ids=>{submitted=ids;assert.equal(store.get().status,'waiting');return {status,diagnostic:status==='incomplete'?'TD field not found':''};}}
 });
 const result=await controller.run();
 assert.deepEqual(Array.from(submitted),['0067788']);
 assert.equal(result.status,status==='complete'?'completed':'incomplete');
 assert.equal(result.results.length,1);
 assert.equal(result.total,2);
 }
});

test('cancel stops the final Links step without reporting completion',async()=>{
 let started;
 const ready=new Promise(resolve=>{started=resolve;});
 const {controller}=setup({
  PickerDuplicateEngine:{normalizeZip:require('../vendor/duplicate-engine').normalizeZip,createSearchPlan:()=>[{id:'one'}],consolidateCandidates:()=>[{candidate:{slId:'0067788'}}],getTopTdIds:()=>['0067788']},
  PickerBookmarkLinks:{execute:(_ids,{signal})=>new Promise(resolve=>{signal.addEventListener('abort',()=>resolve({status:'incomplete',diagnostic:'Search cancelled'}));started();})}
 });
 const running=controller.run();
 await ready;
 controller.cancel();
 const result=await running;
 assert.equal(result.status,'cancelled');
 assert.equal(result.results.length,1);
});

test('banner store number fills the bot source and drives the store search without editing client data',async()=>{
 const source={slId:'SRC',bannerName:'Acme #00123',storeNumber:'',zip:'98407'};
 const {controller,store}=setup({PickerDuplicateEngine:require('../vendor/duplicate-engine'),PickerGsrsTableAdapter:{extractFromDocument:()=>({profile:'storeView',source,candidates:[]})}});
 const result=await controller.run('store');
 assert.equal(store.get().source.storeNumber,'00123');
 assert.equal(store.get().source.storeNumberInferred,true);
 assert.equal(result.plan[0].fields.storeNumber,'00123');
 assert.equal(result.plan[0].fields.banner,'acme*');
 assert.equal(source.storeNumber,'');
});


test('pause during final Links review holds completion until Continue and Stop releases it',async()=>{
 for(const stop of [false,true]){
  let started,finish;
  const ready=new Promise(resolve=>{started=resolve;});
  const {controller,store}=setup({
   PickerDuplicateEngine:{normalizeZip:require('../vendor/duplicate-engine').normalizeZip,createSearchPlan:()=>[{id:'one'}],consolidateCandidates:()=>[{candidate:{slId:'0067788'}}],getTopTdIds:()=>['0067788']},
   PickerBookmarkLinks:{execute:()=>{started();return new Promise(resolve=>{finish=resolve;});}}
  });
  let finished=false;
  const running=controller.run().then(result=>{finished=true;return result;});
  await ready;
  controller.pause();
  finish({status:'complete'});
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(store.get().status,'paused');assert.equal(finished,false);
  if(stop)controller.cancel();else controller.resume();
  assert.equal((await running).status,stop?'cancelled':'completed');
 }
});


test('a failed run is reported in the panel and does not block a subsequent retry',async()=>{
 let fail=true;
 const {controller,store}=setup({PickerManualMatchAdapter:{execute:async()=>{if(fail)throw Error('Temporary page error');return {status:'complete',rows:[]};}}});
 const failed=await controller.run();assert.equal(failed.status,'incomplete');assert.match(store.get().diagnostic,/Temporary page error/);
 fail=false;assert.equal((await controller.run()).status,'completed');
});

test('source-reader errors stay local and recover on a later refresh',()=>{
 let fail=true;
 const {controller,store}=setup({PickerGsrsTableAdapter:{extractFromDocument:()=>{if(fail)throw Error('DOM replaced');return {profile:'storeView',source:{slId:'NEW',bannerName:'Acme'},candidates:[]};}}});
 assert.equal(controller.scan().error,'source-read-failed');assert.match(store.get().diagnostic,/could not be read/);
 fail=false;controller.refresh();assert.equal(store.get().source.slId,'NEW');
});

test('a busy or closed bookmark returns a status without an unhandled rejection',async()=>{
 let finish;
 const {controller}=setup({PickerRunController:{createRunController:()=>({start:()=>new Promise(resolve=>{finish=resolve;}),isActive:()=>true,cancel(){}})}});
 const first=controller.run();assert.equal((await controller.run()).status,'busy');finish({status:'completed',observations:[]});await first;
 controller.destroy();assert.equal((await controller.run()).status,'cancelled');
});

test('background refresh requests source-only data rather than rescanning results',()=>{
 const requests=[];const source={slId:'SRC',bannerName:'Acme'};
 const {controller}=setup({PickerGsrsTableAdapter:{extractFromDocument:(_doc,_profile,options)=>{requests.push(options);return {profile:'storeView',source,candidates:[]};}}});
 controller.scan();controller.refresh();assert.equal(requests.at(-1).includeCandidates,false);
});

test('an unexpected final TD error retains ranked results and permits retry',async()=>{
 const {controller,store}=setup({PickerDuplicateEngine:{normalizeZip:require('../vendor/duplicate-engine').normalizeZip,createSearchPlan:()=>[{id:'one'}],consolidateCandidates:()=>[{candidate:{slId:'0067788'}}],getTopTdIds:()=>['0067788']},PickerBookmarkLinks:{execute:async()=>{throw Error('TD screen changed');}}});
 const result=await controller.run();assert.equal(result.status,'incomplete');assert.equal(store.get().results[0].candidate.slId,'0067788');assert.match(store.get().diagnostic,/TD screen changed/);
});

test('normalization errors are shown locally instead of escaping a background scan',()=>{
 const {controller,store}=setup({PickerDuplicateEngine:{normalizeSource(){throw Error('Invalid source');}}});
 assert.equal(controller.scan().error,'source-read-failed');assert.match(store.get().diagnostic,/could not be prepared/);
});


test('individual searches never perform final TD lookup and never rank pre-existing table rows',async()=>{
 const Engine=require('../vendor/duplicate-engine');let prior=[{slId:'9999999',bannerName:'Zone Appliance',address:'10 Main St'}];let sequence=0,tdSearches=0;
 const source={slId:'SOURCE',bannerName:'Zone Appliance',storeNumber:'12',address:'10 Main St',city:'Austin',state:'TX',zip:'78701',phone:'5125551212'};
 const {controller,store}=setup({
  PickerDuplicateEngine:Engine,
  PickerGsrsTableAdapter:{extractFromDocument:()=>({profile:'storeView',source,candidates:prior})},
  PickerManualMatchAdapter:{execute:async()=>({status:'complete',rows:[{slId:String(++sequence).padStart(7,'0'),bannerName:source.bannerName,address:source.address}]})},
  PickerBookmarkLinks:{execute:async()=>{tdSearches++;return {status:'complete'};}}
 });
 for(const group of ['banner','bannerState','address','phone','store']){
  const before=sequence,result=await controller.run(group);
  assert.equal(result.status,'completed',group);assert.equal(tdSearches,0,group);
  assert.equal(store.get().searchGroup,group);assert.equal(result.linksSearch,null,group);assert.equal(result.tdIds.length,0,group);
  assert.equal(result.results.length,sequence-before,group);
  for(const row of result.results)assert.ok(Number(row.candidate.slId)>before && Number(row.candidate.slId)<=sequence,group);
  assert.equal(store.get().results.some(row=>row.candidate.slId==='9999999'),false);
  prior=result.results.map(row=>row.candidate);
 }
});

test('All Search submits only the top five unique TDs from its own completed searches',async()=>{
 const Engine=require('../vendor/duplicate-engine');const source={slId:'SRC',bannerName:'Acme',address:'10 Main St',city:'Austin',state:'TX',zip:'78701',phone:'5125551212',storeNumber:'12'};
 let sequence=0;const submissions=[];
 const {controller}=setup({PickerDuplicateEngine:Engine,
  PickerGsrsTableAdapter:{extractFromDocument:()=>({profile:'storeView',source,candidates:[{...source,slId:'9999999'}]})},
  PickerManualMatchAdapter:{execute:async()=>({status:'complete',rows:[{...source,slId:String(++sequence).padStart(7,'0')}]})},
  PickerBookmarkLinks:{execute:async ids=>{submissions.push([...ids]);return {status:'complete'};}}
 });
 const result=await controller.run('all');
 assert.equal(sequence,9);assert.equal(submissions.length,1);assert.deepEqual(submissions[0],['0000001','0000002','0000003','0000004','0000005']);
 assert.equal(result.results.some(row=>row.candidate.slId==='9999999'),false);
 assert.equal(result.status,'completed');assert.equal(result.total,10);
});

test('empty or incomplete current searches cannot reuse previous TDs or trigger final lookup',async()=>{
 for(const status of ['complete','incomplete']){
  let tdSearches=0;const Engine=require('../vendor/duplicate-engine');
  const {controller}=setup({PickerDuplicateEngine:Engine,
   PickerGsrsTableAdapter:{extractFromDocument:()=>({profile:'storeView',source:{slId:'SRC',bannerName:'Acme',zip:'78701'},candidates:[{slId:'9999999',bannerName:'Acme'}]})},
   PickerManualMatchAdapter:{execute:async()=>({status,rows:status==='complete'?[]:[{slId:'8888888',bannerName:'Acme'}]})},
   PickerBookmarkLinks:{execute:async()=>{tdSearches++;return {status:'complete'};}}
  });
  const result=await controller.run('all');assert.equal(result.results.length,0);assert.equal(result.tdIds.length,0);assert.equal(tdSearches,0);
 }
});

test('observations from an unrelated query cannot enter current rankings',async()=>{
 const {controller}=setup({PickerRunController:{createRunController:()=>({start:async()=>({status:'completed',observations:[{queryId:'old-query',status:'complete',rows:[{slId:'9999999'}]},{queryId:'one',status:'complete',rows:[{slId:'0000001'}]}]}),isActive:()=>false,cancel(){}})}});
 const result=await controller.run();assert.deepEqual(Array.from(result.results,row=>row.slId),['0000001']);
});


test('the production controller uses conservative loading and pacing settings',async()=>{
 const {controller}=setup({PickerRunController:{createRunController:options=>{
  assert.equal(options.queryTimeoutMs,120000);assert.equal(options.safetyDelayMs,900);assert.equal(options.stopOnIncomplete,true);assert.ok(options.runTimeoutMs>=240900);
  return {start:async()=>({status:'completed',observations:[]}),cancel(){},isActive:()=>false};
 }}});
 assert.equal((await controller.run()).status,'completed');
});

test('Stop during the final TD pause cancels the pending request immediately',async()=>{
 let submitted=0;
 const {controller,store}=setup({PickerDuplicateEngine:{normalizeZip:require('../vendor/duplicate-engine').normalizeZip,createSearchPlan:()=>[{id:'one'}],consolidateCandidates:()=>[{candidate:{slId:'0067788'}}],getTopTdIds:()=>['0067788']},PickerBookmarkLinks:{execute:async()=>{submitted++;return {status:'complete'};}}});
 const pending=controller.run();await new Promise(resolve=>setTimeout(resolve,10));assert.equal(store.get().activeQuery.type,'links');const start=Date.now();controller.cancel();
 assert.equal((await pending).status,'cancelled');assert.equal(submitted,0);assert.ok(Date.now()-start<300);
});


test('one click owns one filter session across all its queries',async()=>{
 let begins=0,ends=0,queries=0;const session={ok:true,snapshot:{},closed:false};
 const {controller}=setup({PickerManualMatchAdapter:{
  beginSearchSession:()=>{begins++;return session;},endSearchSession:value=>{assert.equal(value,session);ends++;return {ok:true};},
  execute:async(_query,options)=>{assert.equal(options.session,session);queries++;return {status:'complete',rows:[]};}
 }});
 assert.equal((await controller.run()).status,'completed');assert.equal(begins,1);assert.equal(ends,1);assert.equal(queries,2);
});

test('an interrupted run still closes its filter session exactly once',async()=>{
 let ends=0;const session={ok:true,snapshot:{}};
 const {controller}=setup({PickerManualMatchAdapter:{beginSearchSession:()=>session,endSearchSession:()=>{ends++;return {ok:true};},execute:async()=>{throw Error('Host changed');}}});
 assert.equal((await controller.run()).status,'incomplete');assert.equal(ends,1);
});
