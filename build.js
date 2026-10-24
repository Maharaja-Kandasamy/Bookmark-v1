const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const inputs = [
  'vendor/duplicate-engine.js',
  'vendor/run-controller.js',
  'vendor/semantic-discovery.js',
  'vendor/gsrs-table-adapter.js',
  'vendor/manual-match-adapter.js',
  'vendor/bot-layout.js',
  'src/bookmark-store.js',
  'src/bookmark-lifecycle.js',
  'src/bookmark-controller.js',
  'src/bookmark-robot.js',
  'src/bookmark-bot.js',
  'src/bookmark-entry.js'
];

const banner = '/* Picker Bookmark v1 — self-contained GSRS duplicate assistant */';
const readable = `${banner}\n${inputs.map(file => fs.readFileSync(path.join(root, file), 'utf8').trim()).join('\n')}\n`;
const compact = readable.split(/\r?\n/).map(line => line.trim()).filter(Boolean).join('\n');
const bookmarkUrl = `javascript:${encodeURIComponent(compact)}`;
const template = fs.readFileSync(path.join(root, 'install.template.html'), 'utf8');
const gsrsBookmarkUrl = fs.readFileSync(path.join(root, 'gsrs-bookmarklet.txt'), 'utf8').trim();
const html = template.replaceAll('__GSRS_BOOKMARK_URL__', gsrsBookmarkUrl).replaceAll('__BOOKMARK_URL__', bookmarkUrl).replaceAll('__BOOKMARK_KB__', (Buffer.byteLength(bookmarkUrl) / 1024).toFixed(1));

fs.writeFileSync(path.join(root, 'picker-bookmark-v1.js'), readable);
fs.writeFileSync(path.join(root, 'picker-bookmark-v1.min.js'), bookmarkUrl);
fs.writeFileSync(path.join(root, 'install.html'), html);
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log(`Built Picker Bookmark v1 (${(Buffer.byteLength(bookmarkUrl) / 1024).toFixed(1)} KB)`);
