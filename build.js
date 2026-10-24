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
// Build Visuals from its source too: saved bookmarks must include the latest UI.
const visualsSource = fs.readFileSync(path.join(root, 'gsrs-highlighter.js'), 'utf8');
const visualsCompact = visualsSource.split(/\r?\n/).map(line => line.trim()).filter(Boolean).join('\n');
const gsrsBookmarkUrl = `javascript:${encodeURIComponent(visualsCompact)}`;
fs.writeFileSync(path.join(root, 'gsrs-highlighter.min.js'), visualsCompact);
fs.writeFileSync(path.join(root, 'gsrs-bookmarklet.txt'), gsrsBookmarkUrl);
const html = template.replaceAll('__GSRS_BOOKMARK_URL__', gsrsBookmarkUrl).replaceAll('__BOOKMARK_URL__', bookmarkUrl).replaceAll('__BOOKMARK_KB__', (Buffer.byteLength(bookmarkUrl) / 1024).toFixed(1));

fs.writeFileSync(path.join(root, 'picker-bookmark-v1.js'), readable);
fs.writeFileSync(path.join(root, 'picker-bookmark-v1.min.js'), bookmarkUrl);
fs.writeFileSync(path.join(root, 'install.html'), html);
fs.writeFileSync(path.join(root, 'index.html'), html);
const visualsTemplate = fs.readFileSync(path.join(root, 'gsrs-visuals.template.html'), 'utf8');
fs.writeFileSync(path.join(root, 'gsrs-visuals.html'), visualsTemplate.replaceAll('__GSRS_BOOKMARK_URL__', gsrsBookmarkUrl));
const pickerTemplate = fs.readFileSync(path.join(root, 'picker.template.html'), 'utf8');
fs.writeFileSync(path.join(root, 'picker.html'), pickerTemplate.replaceAll('__BOOKMARK_URL__', bookmarkUrl));
console.log(`Built Picker Bookmark v1 (${(Buffer.byteLength(bookmarkUrl) / 1024).toFixed(1)} KB)`);

// Standard Netscape bookmark export; browsers decide whether to retain embedded icons.
const iconData = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets/icon-32.png')).toString('base64');
const escapeAttr = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
fs.writeFileSync(path.join(root, 'gsrs-visuals-bookmark.html'), `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>GSRS Visuals Bookmark</TITLE>
<H1>GSRS Visuals Bookmark</H1>
<DL><p><DT><A HREF="${escapeAttr(gsrsBookmarkUrl)}" ICON="${iconData}">GSRS Visuals</A></DL><p>
`);

// Picker has a separate import and identity from GSRS Visuals.
const pickerIcon = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets/picker-logo.png')).toString('base64');
fs.writeFileSync(path.join(root, 'picker-bookmark.html'), `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Picker Bookmark</TITLE><H1>Picker Bookmark</H1>
<DL><p><DT><A HREF="${escapeAttr(bookmarkUrl)}" ICON="${pickerIcon}">Picker Bookmark v1</A></DL><p>
`);
