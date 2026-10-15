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
  assert.match(entry, /existing\.open\(\)/);
  assert.match(entry, /delete window\.__pickerBookmarkV1/);
  assert.match(entry, /PickerBookmarkLifecycle\.create/);
  assert.match(entry, /PickerBookmarkController\.create/);
  assert.match(entry, /PickerBookmarkBot\.mount/);
  assert.doesNotMatch(entry, /chrome\./);
});

test('kill animation finishes with controller and lifecycle disposal', () => {
  const ui = src('bookmark-bot.js');
  assert.match(ui, /setAttribute\('data-state', 'exiting'\)/);
  assert.match(ui, /controller\.destroy\(\)/);
  assert.match(ui, /onKilled\(\)/);
  assert.match(ui, /panic-exit/);
});
