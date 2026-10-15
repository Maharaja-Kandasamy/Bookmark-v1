const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function load(file, name) {
  const context = { globalThis: {}, setTimeout, clearTimeout, requestAnimationFrame: fn => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src', file), 'utf8'), context);
  return context.globalThis[name];
}

test('bookmark store publishes merged state and becomes inert after destroy', () => {
  const Store = load('bookmark-store.js', 'PickerBookmarkStore');
  const store = Store.create({ status: 'ready', count: 0 });
  const seen = [];
  const unsubscribe = store.subscribe(state => seen.push({ ...state }));
  store.set({ count: 1 });
  unsubscribe();
  store.set({ count: 2 });
  store.destroy();
  store.set({ count: 3 });
  assert.equal(seen.length, 2);
  assert.equal(seen[1].count, 1);
  assert.equal(store.get(), null);
});

test('lifecycle dispose unregisters every resource exactly once', () => {
  const Lifecycle = load('bookmark-lifecycle.js', 'PickerBookmarkLifecycle');
  const lifecycle = Lifecycle.create();
  const calls = [];
  const target = { addEventListener: (...args) => calls.push(['add', ...args]), removeEventListener: (...args) => calls.push(['remove', ...args]) };
  const observer = { observe: () => calls.push(['observe']), disconnect: () => calls.push(['disconnect']) };
  const handler = () => {};
  lifecycle.listen(target, 'click', handler);
  lifecycle.observe(observer, {}, { subtree: true });
  lifecycle.add(() => calls.push(['custom']));
  lifecycle.dispose();
  lifecycle.dispose();
  assert.equal(calls.filter(x => x[0] === 'remove').length, 1);
  assert.equal(calls.filter(x => x[0] === 'disconnect').length, 1);
  assert.equal(calls.filter(x => x[0] === 'custom').length, 1);
  assert.equal(lifecycle.disposed, true);
});
