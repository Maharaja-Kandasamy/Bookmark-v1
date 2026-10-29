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
  assert.deepEqual(Array.from(store.get().results, x => x.slId), ['A', 'one', 'two']);
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
 const types=['banner-exact-zip','banner-wildcard-zip','address-city','address-zip','phone','store-banner','banner-state'];
 const {controller}=setup({PickerDuplicateEngine:{
  normalizeZip: require('../vendor/duplicate-engine').normalizeZip,
  createSearchPlan:()=>types.map(type=>({id:type,type})),
  consolidateCandidates:()=>[]
 }});
 for(const [group,expected] of [['banner',types.slice(0,2)],['address',types.slice(2,4)],['phone',['phone']],['store',['store-banner']],['bannerState',['banner-state']],['all',types]]){
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
