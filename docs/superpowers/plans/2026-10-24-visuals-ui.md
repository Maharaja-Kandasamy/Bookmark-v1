# GSRS Visuals UI update

Approved design: light, compact GSRS popup with a draggable header; two distinct installation sections with the existing Picker and Visuals logos. Preserve comparison rules and Picker behavior. Publish to main and verify GitHub Pages.

Approach: extend the existing plain JavaScript and static installer. A dark theme was considered; the user selected light. No framework or runtime downloads are needed.

1. Add browser checks for pointer dragging, viewport bounds, keyboard movement, resize, repeat activation, removal, separate logos, and two valid bookmark URLs. Confirm dragging fails before implementation.
2. Update gsrs-highlighter.js presentation and header movement. Keep matching and page-size logic intact. Regenerate its self-contained bookmark and the Visuals detail page.
3. Update install.template.html with two responsive cards and tool-specific branding. Extend build.js to generate separate bookmark imports and rebuild both install pages.
4. Run existing comparison regressions and repository tests; inspect desktop/mobile screenshots. Check exported bookmarks and generated output consistency.
5. Publish the verified files in one commit based on the current main head, then inspect Pages deployment and the actual live page.

Review focus: touch cancellation, controls remaining clickable, narrow screens and viewport resizing, repeated launches and event cleanup, correct code and icon in each separate bookmark export.
