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
