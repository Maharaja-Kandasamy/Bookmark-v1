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
