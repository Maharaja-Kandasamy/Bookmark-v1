# GSRS Visuals

## Install in Chrome or Edge
1. Open install.html in your browser.
2. Press Ctrl+Shift+B to display the bookmarks bar.
3. Drag the GSRS Visuals button onto that bar.
4. Open the live GSRS New Records screen and click the bookmark.

Alternatively create a bookmark, edit its URL and paste ALL of gsrs-bookmarklet.txt.
The installer and readable source require no installation or dependencies.

## Use
Supports both New Records and Change Records. Only the visible tab is compared.
Change Records compares SL PHONE NUMBER and PHONE separately.
Activation colours the child value blocks and adds one summary panel.
Drag the panel header anywhere on screen. Tab to the header and use arrow keys
(or Shift + arrow keys for larger steps) to move it with the keyboard.
The panel stays inside the viewport when resizing.
Replace a previously saved bookmark to receive this UI update.
Show 100 is optional: it uses XPath to find the New Records page-size control,
opens the Material UI menu and clicks 100, invoking the page's own change handler.
It watches table mutations and waits for a stable table and no visible loading indicator.
It waits up to 30 seconds and reports failure instead of assuming success.
You may select 100 manually instead. Fewer than 100 available results is normal.
Only the current page is counted; other pages are not fetched or aggregated.
Recheck recalculates the visible data. Remove clears all tool styling and observers.
Normal table updates are rechecked while active. Full page refresh clears activation.
Repeated bookmark clicks reuse the same panel. No MATCH/REVIEW checkbox is clicked.

## Matching rules
Each child is compared against its OWN parent in the same field.
RS STORE NAME / SL STORE NAME is the banner; every banner follows the same rules.
Header text determines the mapping, not column positions.
Missing/ambiguous columns or missing banner names generate console warnings.
Misaligned children are skipped for that field/record instead of miscompared.

Exact / green:
- Ignore case, spaces, punctuation, accents and leading zeros in numeric segments.
- Standardize common street suffixes/directions and apartment/suite abbreviations.
- Recognize US state code, full name, and [code] name representations.
Partial / amber (called moderate for addresses):
- Same house number and street name with missing direction or descriptive words. Different house numbers remain red.
- Store/city name has whole-word containment with at least three compact characters.
- US five-digit ZIP matches the prefix of a nine-digit ZIP.
No Match / red: other nonblank differences.
Blank on EITHER side: no highlight and excluded from Exact/Partial/No Match totals.
Unknown address differences, route-number changes and unit-number changes remain red.
These are deterministic comparison rules, not postal verification or GSRS match scores.
Leading-zero removal is applied as requested, including identifiers and postal codes.

## Files
- install.html: drag-to-bookmarks installer plus manual copy box.
- bookmarklet.txt: final one-line minified javascript: URL.
- gsrs-highlighter.min.js: minified JavaScript without javascript: prefix.
- gsrs-highlighter.js: readable commented source.
- build.cjs: optional developer build (rolldown required).
- verify.cjs: browser regression checks (playwright required; uses saved HTML fixture).

## Validation
Tested in installed Chrome with the supplied saved HTML: 20 parents, 67 children.
Checked header reordering, SL prefix, repeat activation, address and numeric rules,
blank handling, simulated asynchronous page-size reload, removal and reactivation.
The test fixture is not bundled because it contains your store data.
Live GSRS network/reload behavior and Edge have not been directly tested.
A site's security policy may block bookmarklets; a browser extension is a fallback
if your managed browser blocks activation.

## Phone and partial address updates
RS and SL prefixes are detected dynamically, including underscore separators.
Both phone columns compare the last seven digits after removing formatting, a US country code and extensions. Zeros are preserved. Parent area codes are checked against each child’s area code; local matches with area-code differences or missing area codes are partial.
An extra business prefix or missing street words can produce a partial address match when the house number and core street name agree. Route and unit number differences remain red.

