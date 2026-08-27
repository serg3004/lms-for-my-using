# Manual accessibility checklist

Use this checklist for release candidates and after changes to navigation, layouts, forms, tables, dialogs, or runtime theme colors. Record the browser, operating system, assistive technology, tested role, result, and follow-up issue in the release evidence.

Automated coverage is described in [`ACCESSIBILITY.md`](./ACCESSIBILITY.md). The checks below deliberately cover behavior that axe and render tests cannot fully verify.

## Keyboard and focus

- [ ] On every public page and role workspace, the first `Tab` reveals the skip link; activating it moves focus to the visible main content.
- [ ] Reach and operate every link, button, input, select, menu, tab, and dialog control using only `Tab`, `Shift+Tab`, `Enter`, `Space`, and arrow keys where appropriate.
- [ ] Focus is always visible at 100% and 200% zoom and is not hidden behind sticky content.
- [ ] Opening a menu or modal moves focus into it, `Escape` closes it, focus returns to the trigger, and focus cannot escape an open modal.
- [ ] The focus order follows the visual and reading order, including mobile navigation.
- [ ] No keyboard trap exists, except the intentional focus trap while a modal is open.

## Structure and screen readers

- [ ] Each key page has one main landmark, a descriptive level-one heading, and headings that communicate the page structure without skipped levels.
- [ ] NVDA with Firefox or VoiceOver with Safari announces the page title, landmarks, headings, navigation labels, table names, column headers, and current navigation item meaningfully.
- [ ] Icon-only controls have an accessible name that describes the action; decorative icons and images are ignored.
- [ ] Form controls announce their label, required state, hint, invalid state, and associated error.
- [ ] Loading and successful updates are announced without moving focus; errors are announced and focus can reach the recovery action.
- [ ] Tables remain understandable when navigating by row and column, and sortable columns announce their sort state.

## Visual presentation

- [ ] Text, controls, focus indicators, status badges, charts, and runtime theme colors meet WCAG AA contrast requirements in default, hover, focus, disabled, error, and selected states.
- [ ] At 200% browser zoom and at 320 CSS pixels wide, content reflows without loss of information or two-dimensional scrolling except for genuinely tabular content.
- [ ] Increasing text spacing to WCAG values does not clip, overlap, or hide content or controls.
- [ ] Meaning is not conveyed by color, position, shape, or motion alone.
- [ ] With reduced motion enabled, non-essential animation is removed and all workflows remain usable.

## Content and media

- [ ] Link and button names make sense out of context and repeated actions have enough context to distinguish them.
- [ ] Informative images have useful alternative text; decorative images use empty alternative text.
- [ ] Prerecorded media has accurate captions and, when needed, an audio description or transcript.
- [ ] Session timeouts warn users early enough to extend the session without losing entered data.

## Test record

| Date | Build/commit | Browser / AT | Viewport / zoom | Roles and pages | Result | Follow-up issue |
| --- | --- | --- | --- | --- | --- | --- |
| YYYY-MM-DD | `commit` | Browser, screen reader | Size, zoom | Scope | Pass/fail | URL or none |
