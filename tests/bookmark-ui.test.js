const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = name => fs.readFileSync(path.resolve(__dirname, '../src', name), 'utf8');

test('bookmark robot contains required on-page controls without extension or Google scraper APIs', () => {
  const ui = src('bookmark-bot.js');
  for (const label of ['Run All Checks','Retry Incomplete','Pause','Cancel','Google Address Search','Map Address Search','Copy Store Data','TD Copy','Full Copy','Kill Bot']) assert.match(ui, new RegExp(label));
  assert.match(ui, /attachShadow/);
  assert.match(ui, /picker-bookmark-v1-host/);
  assert.doesNotMatch(ui, /chrome\./);
  assert.doesNotMatch(ui, /Live Google Search|pickerLookup|latestGoogleBusiness/);
});

test('entry point enforces one instance and permits clean relaunch after kill', () => {
  const entry = src('bookmark-entry.js');
  assert.match(entry, /window\.__pickerBookmarkV1/);
  assert.match(entry, /existing\.kill\(\)/);
  assert.match(entry, /delete window\.__pickerBookmarkV1/);
  assert.match(entry, /PickerBookmarkLifecycle\.create/);
  assert.match(entry, /PickerBookmarkController\.create/);
  assert.match(entry, /PickerBookmarkBot\.mount/);
  assert.doesNotMatch(entry, /chrome\./);
});

test('kill immediately disposes controller and lifecycle', () => {
  const ui = src('bookmark-bot.js');
  assert.match(ui, /setAttribute\('data-state', 'exiting'\)/);
  assert.match(ui, /controller\.destroy\(\)/);
  assert.match(ui, /onKilled\(\)/);
  assert.match(ui, /panic-exit/);
});

test('robot follows the restrained product visual system', () => {
  const ui = src('bookmark-bot.js');
  assert.match(ui, /--accent:#2563eb/);
  assert.match(ui, /--success:#15803d/);
  assert.match(ui, /--warning:#b45309/);
  assert.match(ui, /--error:#b91c1c/);
  assert.match(ui, /focus-visible/);
  assert.match(ui, /data-icon=/);
  assert.match(ui, /stroke-width="2"/);
  assert.doesNotMatch(ui, /linear-gradient|radial-gradient|backdrop-filter|0 0 13px|[↗✨🤖🚀]/u);
  assert.doesNotMatch(ui, /class="logo">P1/);
  assert.match(ui, /data:image\/png;base64,/);
  assert.match(ui, /google-search/);
  assert.match(ui, /https:\/\/www\.google\.com\/search\?q=\$\{encodeURIComponent\(query\)\}/);
  assert.match(ui, /class="ear"/);
  assert.match(ui, /class="antenna"/);
  assert.match(ui, /class="pupil"/);
  assert.match(ui, /pointermove/);
  assert.match(ui, /translate\(\$\{dx\}px,\$\{dy\}px\)/);
  assert.match(ui, /class="badge"/);
  assert.match(ui, /shell\.picking/);
  assert.match(ui, /shell\.released/);
  assert.match(ui, /pick-squeeze/);
  assert.match(ui, /pick-release/);
});

test('relaunch disposes the previous instance and reads a fresh source', () => {
  const vm = require('node:vm');
  let record='OLD', scans=0, kills=0;
  const win={};
  const context={window:win,document:{}};
  context.globalThis={
    PickerBookmarkLifecycle:{create:()=>({dispose(){}})},
    PickerBookmarkStore:{create:()=>({destroy(){}})},
    PickerBookmarkController:{create:()=>({scan(){scans++;return {source:{slId:record}};},refresh(){}})},
    PickerBookmarkBot:{mount:({onKilled})=>({open(){},destroy(){kills++;onKilled();}})}
  };
  vm.runInNewContext(src('bookmark-entry.js'),context);
  const previous=win.__pickerBookmarkV1;
  record='NEW';
  context.globalThis.PickerBookmarkV1.launch();
  assert.equal(scans,2);
  assert.equal(kills,1);
  assert.notEqual(win.__pickerBookmarkV1,previous);
});

test('missing source still opens UI and leaves refresh monitoring active', () => {
  const vm = require('node:vm');
  let opened=0,mounted=0,disposed=0;
  const win={alert(){throw new Error('Must show diagnostic in the panel');}};
  const context={window:win,document:{}};
  context.globalThis={
    PickerBookmarkLifecycle:{create:()=>({dispose(){disposed++;}})},
    PickerBookmarkStore:{create:()=>({destroy(){disposed++;}})},
    PickerBookmarkController:{create:()=>({scan:()=>({error:'source-table-not-found'}),refresh(){}})},
    PickerBookmarkBot:{mount:()=>{mounted++;return {open(){opened++;},destroy(){}};}}
  };
  vm.runInNewContext(src('bookmark-entry.js'),context);
  assert.equal(mounted,1);
  assert.equal(opened,1);
  assert.equal(disposed,0);
  assert.ok(win.__pickerBookmarkV1);
});
