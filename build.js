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
  'src/bookmark-links.js',
  'src/bookmark-controller.js',
  'src/bookmark-robot.js',
  'src/bookmark-progress.js',
  'src/bookmark-recovery.js',
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
fs.writeFileSync(path.join(root, 'picker-recovery-bookmark.html'), `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Picker Recovery Bookmark</TITLE><H1>Picker Recovery Bookmark</H1>
<DL><p><DT><A HREF="${escapeAttr(bookmarkUrl)}" ICON="${pickerIcon}">Picker Recovery</A></DL><p>
`);
fs.writeFileSync(path.join(root, 'picker-recovery-drag.html'), `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Picker Recovery Bookmark</title><style>body{font:16px Segoe UI,Arial,sans-serif;max-width:680px;margin:10vh auto;padding:24px;color:#172033}a{display:inline-block;padding:14px 22px;border-radius:10px;background:#2563eb;color:white;font-weight:700;text-decoration:none}p{line-height:1.55}.note{color:#526078}</style>
<h1>Picker Recovery Bookmark</h1><p>Drag this button to your browser bookmarks bar:</p><p><a href="${escapeAttr(bookmarkUrl)}" draggable="true">Picker Recovery</a></p><p class="note">Open GSRS Manual Match and launch this bookmark once to save the current Batch ID and Match Filter. If GSRS shows “Something went wrong,” open Picker and choose <b>Recover last GSRS screen</b>.</p></html>
`);
