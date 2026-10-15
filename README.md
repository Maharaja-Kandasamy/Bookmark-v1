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
- Draggable animated robot with responsive panel placement.
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
