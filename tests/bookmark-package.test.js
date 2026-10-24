const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const repo = path.resolve(__dirname, '..');
const parent = path.resolve(repo, '..');
const baseline = {
  'manifest.json':'c49035fc02b0889077dd4f10ddcdfee936fc9f27da18752308d3d50c9d461894',
  'popup.html':'d9ff7d18beac2b29b7b78320721f0c85a41d504e1f920ca3ef1bd9886ea84ee6',
  'popup.js':'d9fafaec6a19b1c17513c3df7887dcb973702c499135c3ee6ee32b68ea440aad',
  'content.js':'8a9f90446bbdab9c75285bd696c2e5e268bf3778d947a4f193d026e60fa00696',
  'Picker-5.0-Sharing.zip':'89d5a0dd5eee250c57cbc6c1f1b87d8ae585ea0046b79f173edb331478243c31',
  'src/bot-layout.js':'5e454fe1f4fa4b3ce1a06504f8c6670eefca4994c55d7f110fe07ff15245c715',
  'src/bot-ui.js':'029d3a60acd11ca0112868253458121b3957a1542f2738c714cf99302ce6c7e6',
  'src/duplicate-engine.js':'73d8bf697e28c07e5ba4bd19042d958a4aa3ebd4f73441413a6a6ee400a7630f',
  'src/gsrs-table-adapter.js':'4d3de70b8126cb3c2df91c71a9d4c5fcede0a526c1c0a95251e31583b35e6f44',
  'src/manual-match-adapter.js':'5cb04e76af283daf5a1080d52a02f83b32b9290031644ac9a086f9938edcfb60',
  'src/run-controller.js':'354769bb5525a89df0101d056195b611e1074055d9ef88f55213c74c812e632a',
  'src/semantic-discovery.js':'95bfc919ab00c92ad576f516b6d2cc95c4b9b59f7f8b7178395b984475d28eb2'
};
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('bookmark build is self-contained and excludes extension-only functionality', () => {
  const readable = fs.readFileSync(path.join(repo, 'picker-bookmark-v1.js'), 'utf8');
  const bookmark = fs.readFileSync(path.join(repo, 'picker-bookmark-v1.min.js'), 'utf8');
  assert.doesNotThrow(() => new Function(readable));
  assert.ok(bookmark.startsWith('javascript:'));
  const payload = decodeURIComponent(bookmark.slice('javascript:'.length));
  assert.doesNotThrow(() => new Function(payload), 'The installed bookmark payload must parse, including line comments');
  assert.doesNotMatch(readable, /chrome\.|pickerLookup|latestGoogleBusiness|Live Google Search/);
  assert.match(readable, /PickerBookmarkV1/);
});

test('install page embeds the exact generated bookmark URL', () => {
  const bookmark = fs.readFileSync(path.join(repo, 'picker-bookmark-v1.min.js'), 'utf8').trim();
  const html = fs.readFileSync(path.join(repo, 'install.html'), 'utf8');
  const match = html.match(/id="install-link"[^>]+href="([^"]+)"/);
  assert.ok(match);
  assert.equal(match[1], bookmark);
  assert.match(html, /Install Picker in your bookmarks bar/);
  assert.equal(fs.readFileSync(path.join(repo, 'index.html'), 'utf8'), html);
});

test('extension production files retain their pre-bookmark hashes', () => {
  if (!fs.existsSync(path.join(parent, 'manifest.json'))) return;
  for (const [file, expected] of Object.entries(baseline)) assert.equal(hash(path.join(parent, file)), expected, file);
});

test('standalone repository includes every reusable runtime dependency', () => {
  for (const file of ['duplicate-engine.js','run-controller.js','semantic-discovery.js','gsrs-table-adapter.js','manual-match-adapter.js','bot-layout.js']) assert.ok(fs.existsSync(path.join(repo, 'vendor', file)), file);
});

test('repository contains an automated GitHub Pages deployment', () => {
  const workflow = fs.readFileSync(path.join(repo, '.github/workflows/pages.yml'), 'utf8');
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /node build\.js/);
  assert.match(workflow, /node --test tests\/\*\.test\.js/);
});

test('installer uses a restrained responsive product layout', () => {
  const template = fs.readFileSync(path.join(repo, 'install.template.html'), 'utf8');
  assert.match(template, /--accent:#2563eb/);
  assert.match(template, /font-family:Inter,ui-sans-serif,system-ui/);
  assert.match(template, /:focus-visible/);
  assert.match(template, /@media\(max-width:640px\)/);
  assert.doesNotMatch(template, /gradient|backdrop-filter|box-shadow:0 28px|[↗✨🤖🚀]/u);
  assert.match(template, /grid-template-columns:1fr 1fr/);
  assert.match(template, /assets\/picker-logo\.png/);
  assert.match(template, /assets\/visuals-logo\.png/);
  assert.match(template, /picker-bookmark\.html/);
  assert.match(template, /gsrs-visuals-bookmark\.html/);
  assert.doesNotMatch(template, /\.side\{order:-1\}/);
  assert.match(template, /assets\/icon-32\.png/);
  assert.doesNotMatch(template, /brand-mark">P1/);
  assert.ok(fs.existsSync(path.join(repo, 'assets', 'picker-logo.png')));
  for (const size of [16, 32, 48, 128]) assert.ok(fs.existsSync(path.join(repo, 'assets', `icon-${size}.png`)), `icon-${size}`);
});

test('Visuals build and both icon imports contain the current separate bookmark payloads', () => {
  const visuals = fs.readFileSync(path.join(repo, 'gsrs-bookmarklet.txt'), 'utf8').trim();
  const picker = fs.readFileSync(path.join(repo, 'picker-bookmark-v1.min.js'), 'utf8').trim();
  const payload = decodeURIComponent(visuals.slice('javascript:'.length));
  assert.doesNotThrow(() => new Function(payload));
  assert.match(payload, /setPointerCapture/);
  assert.match(payload, /pointercancel/);
  assert.match(payload, /document\.addEventListener\('pointermove',moveDrag\)/);
  assert.match(payload, /document\.removeEventListener\('pointermove',moveDrag\)/);
  assert.match(payload, /removeEventListener\('resize'/);
  assert.match(fs.readFileSync(path.join(repo, 'index.html'), 'utf8'), /data-drag/);
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const p = fs.readFileSync(path.join(repo, 'picker-bookmark.html'), 'utf8');
  const v = fs.readFileSync(path.join(repo, 'gsrs-visuals-bookmark.html'), 'utf8');
  assert.ok(p.includes(escape(picker)));
  assert.ok(v.includes(escape(visuals)));
  assert.notEqual(p.match(/ICON="([^"]+)/)[1], v.match(/ICON="([^"]+)/)[1]);
  assert.ok(fs.readFileSync(path.join(repo, 'gsrs-visuals.html'), 'utf8').includes(visuals));
});
