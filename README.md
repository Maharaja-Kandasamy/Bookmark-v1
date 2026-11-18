# GSRS toolkit

Two independent bookmark tools for GSRS: Picker for Manual Match and GSRS Visuals for New Records.

Published site: [Bookmark-v1](https://maharaja-kandasamy.github.io/Bookmark-v1/).

- [Picker](https://maharaja-kandasamy.github.io/Bookmark-v1/picker.html) · [How it works](https://maharaja-kandasamy.github.io/Bookmark-v1/picker-how-it-works.html)
- [GSRS Visuals](https://maharaja-kandasamy.github.io/Bookmark-v1/gsrs-visuals.html) · [How it works](https://maharaja-kandasamy.github.io/Bookmark-v1/gsrs-visuals-how-it-works.html)

## Picker Recovery Bookmark

This isolated local copy adds a recovery action to Picker. At launch it remembers the visible Batch ID and Match Filter in the current GSRS tab session. If GSRS shows its error screen, use **Recover last GSRS screen** in the bot to return to Input MM Jobs, find the exact batch, open Manual Match, and restore the filter. The recovery waits for the page to settle and stops if either search does not produce exactly one match.

## Install

1. Open the published GitHub Pages installation page.
2. Show Chrome's bookmarks bar with **Ctrl + Shift + B**.
3. Import picker-recovery-bookmark.html from Chrome Bookmark Manager, or create a bookmark from its JavaScript URL.
4. Open the Manual Match screen and launch the bookmark so it can remember the current batch and filter.

If dragging is restricted, use **Copy bookmark link**, create a normal bookmark, and paste the copied value into its URL field.

## Included

- Store and Retail Manual Match table extraction.
- Recovery button that returns to Input MM Jobs and restores the launch-time Batch ID and Match Filter.
- Sequential GSRS duplicate searches that wait for the result table to settle before advancing.
- Live per-query captures in the open bot panel, including row counts, candidate summaries, no-match results, and incomplete searches. Comparison and ranking begin only after every planned search completes.
- Retry Incomplete preserves successful captures and reruns only the missing searches.
- Direct, exact, high-confidence, and partial duplicate ranking.
- Candidate-specific **TD Copy** and **Full Copy**.
- Source-field and full-store copying.
- AstroBot SVG robot with idle blinking, greeting wave, search thinking, completion celebration, paused blinking, drag dangling, and landing bounce.
- Responsive panel placement, pointer tracking, and reduced-motion support.
- Google Address Search and Map Address Search as normal outbound links.
- Kill Bot stops searches immediately, plays a single red overload and burst animation, then removes the robot. Reduced-motion users get immediate removal; relaunch safely replaces a departing robot.

## Intentionally excluded

- Chrome extension APIs, popup, automatic launch, and background activity.
- Automatic Google phone-number or business-status extraction.
- Cross-tab communication or Google result collection.

## Development

```text
npm run verify
```

`build.js` creates the readable bundle, self-contained bookmark URL, and installation page. The generated bookmark does not download runtime code from GitHub.

## Matching and record refresh

Address wildcard searches omit common road types and abbreviations (Road/Rd, Street/St, Avenue/Ave, etc.), directions, Mount/Mt, and suite/unit details. Banner wildcard searches and comparison keys omit company suffixes such as Ltd, Inc, LLC, and Corporation. Original source values and copies remain intact; broader searches can return extra candidates requiring review.

The bot monitors the source table while open, resets results when the record changes, and cancels searches belonging to the previous record. Every run rescans the page. Clicking the bookmark again replaces the current bot with a fresh instance.

After an update, replace your saved bookmark using the newly generated installation page. Saved bookmarks contain their own code and do not update automatically. When replacing an older version, use Kill Bot first or reload the page before launching the new bookmark.

## Search controls

The compact buttons above the robot antenna are B (Banner), A (Address), P (Phone), S (Store number), and All. Banner runs exact and wildcard banner with ZIP3; Address runs wildcard address with city and ZIP3; Phone uses the last seven digits; Store uses store number with wildcard banner. Clicking any search minimizes the panel. Click the robot to reopen results.

Automation keeps non-query search values, temporarily selects only the filters needed for the query, and restores the original values and checkbox selections after completion, cancellation, timeout, or failure. It does not restore an old record's search values after navigation to a different record.

## ZIP+4 and final Links search

Picker accepts five-digit ZIPs, ZIP+4 with a hyphen, and compact ZIP+4 values. Short base ZIPs are padded to five digits. Compact six-to-nine-digit values are treated as ZIP+4 with missing leading zeros: `9877678` becomes `00987-7678`, with `00987` for the base ZIP and `009*` for ZIP3 searches. Malformed formats are excluded from ZIP searches. This repairs formatting; it does not verify address deliverability.

After a successful duplicate-search group, Picker takes up to five unique numeric TD IDs from the final ranking, preserves leading zeros, discovers the labelled Links control, TD input and Search button, and submits the IDs as a comma-separated list. Completion waits for this final search to settle. Missing or ambiguous controls leave ranked results available with an incomplete diagnostic and the TD list. Original search-field values are restored after the operation. Cancellation and source changes stop the final search.

## Primary street and unit matching

Address search uses the first house number and primary street name. House numbers longer than four digits lose their final two digits; shorter numbers lose one digit, retaining at least one. Each street-name word loses its final two letters, retaining at least one. Components are joined by single wildcards with no spaces. Road types, directions, unit/suite details and appended secondary addresses are omitted. Example: `5121 N Pearl St #100 23315 Co Hwy 18 Ruston WA` searches as `512*pea*`.

Original house numbers and unit values are kept for ranking. An exact full address plus unit match takes priority; merely matching a shortened house-number prefix does not count as an exact address. Banner matching treats spaced possessive `Wren S`, `Wren's`, and `Wrens` equivalently; the wildcard is `wren*nest*baki*` for `Wren S Nest Baking Co`.

## Noisy banner search text

Banner queries omit standalone one-character tokens and treat punctuation as wildcard boundaries. `Circle K`, `Circle @ K`, and `A Circle B` search as `circle*`. A single remaining word is kept in full; multiword queries retain the existing four-character word prefixes with single `*` separators and no spaces. HTML fragments/entities, URLs, email addresses, placeholder words and long phone-like numeric tokens are excluded from search text. Banner searches are skipped when no useful words remain. Original banner text and identity comparisons remain available for display and ranking; broad retrieval alone is not an exact name match.

## Visible progress, match reasons and banner store numbers

While the panel is minimized, a small status beside the robot names the current search and its progress. Stop cancels the active automation without opening the panel. Final TD lookup displays `Reviewing links for the top N matches...`; `Finished` appears only after that step completes. Cancellation displays `Stopped`, and incomplete searches ask the user to open results.

Result cards summarize the strongest matching evidence and separately show conflicts such as `Different unit: 200 instead of 100`. Existing ranking keeps the strongest full address/unit match first.

When Store # is blank, a single unambiguous numeric hashtag in the banner (for example `Acme #00123`) fills the bot's Store # with `00123` and enables the Store search. It is marked `from banner`; an existing Store # always takes priority. Hashtag numbers are omitted from business-name queries and comparisons. Multiple distinct hashtag numbers are not guessed. Client records are not edited.
