# Accessibility baseline

The browser baseline targets WCAG 2.1 level AA. `pnpm test:a11y` starts the same isolated API and web stack as the functional Playwright suite and audits public pages plus every role workspace with axe. Any `critical`, `serious`, or `moderate` violation fails CI: the agreed moderate baseline is zero. Minor findings do not block the build, but every audit prints severity counts and is retained by CI as a JSON artifact grouped by severity. The suite also exercises skip navigation, menus, forms, mobile navigation with a keyboard, and accessibility at 320 px with 200% browser zoom.

Release candidates must also be evaluated with the [manual accessibility checklist](./A11Y_MANUAL_CHECKLIST.md), which covers screen-reader output, zoom and reflow, focus behavior, contrast across interaction states, and other checks that automation cannot establish conclusively.

The instructor and mentor session-management pages have independent audits at mobile (375 px) and desktop (1440 px) widths. Each role is checked with populated list data, creation and time/observer dialogs, and the report's summary, participants, criteria and history tabs. Each audited state retains its own severity report. Dialog Escape/focus restoration and report-tab keyboard activation are also checked. These reads use isolated API fixtures rather than shared demo-account logins.

Populated session statuses exposed contrast failures in the default success/info colors. Their text tokens in `tokens.css` use darker shades against the existing pale status backgrounds; the WCAG AA gate and its severity threshold remain unchanged.

## Exceptions

There are currently **no accessibility exceptions**.

An exception must not be implemented by disabling an axe rule globally. A future exception requires all of the following in this file:

- the axe rule and the narrowest possible selector;
- user impact and a reason the issue cannot be fixed immediately;
- an accountable owner;
- a removal issue and expiry date;
- a focused test proving that no other content is excluded.

Expired or undocumented exclusions are test failures. Contrast findings are not eligible for a blanket exception.
