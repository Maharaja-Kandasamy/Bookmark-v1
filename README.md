# Picker Bookmark v1

Picker Bookmark v1 is an install-free Store and Retail duplicate assistant for the GSRS Manual Match screen. It runs only when its bookmark is clicked and leaves no background process behind.

## Install

1. Open the published GitHub Pages installation page.
2. Show Chrome's bookmarks bar with **Ctrl + Shift + B**.
3. Drag **Picker Bookmark v1** from the page to the bookmarks bar.
4. Open a Store or Retail Manual Match screen and click the saved bookmark.

If dragging is restricted, use **Copy bookmark link**, create a normal bookmark, and paste the copied value into its URL field.

## Included

- Store and Retail Manual Match table extraction.
- Sequential GSRS duplicate searches that wait for stable results.
- Direct, exact, high-confidence, and partial duplicate ranking.
- Candidate-specific **TD Copy** and **Full Copy**.
- Source-field and full-store copying.
- AstroBot SVG robot with idle blinking, greeting wave, search thinking, completion celebration, paused blinking, drag dangling, and landing bounce.
- Responsive panel placement, pointer tracking, and reduced-motion support.
- Google Address Search and Map Address Search as normal outbound links.
- Kill Bot cleanup and clean relaunch.

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
