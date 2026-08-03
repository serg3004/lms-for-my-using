# CSS architecture

The web application has a single CSS entry point: `apps/web/src/styles/index.css`.
Components and route modules must not import stylesheets directly. This prevents
lazy-route loading order from changing the cascade.

## Cascade layers

The entry point establishes this order before loading any rules:

1. `tokens` — application-wide design decisions from `tokens.css`;
2. `base` — document defaults and element normalization from `global.css`;
3. `layout` — shared structural primitives (reserved for extraction as needed);
4. `components` — reusable UI and design-system classes from `ui.css`;
5. `features` — route/workspace styles (`admin.css`, public home, and login);
6. `utilities` — narrowly scoped helpers (reserved for extraction as needed);
7. `overrides` — documented compatibility fixes only.

Layer priority is determined by that declaration, not by the order in which a
route module is evaluated. New stylesheets must be imported into a named layer
from `index.css`.

## Tokens

All custom properties are defined once in `tokens.css`. Feature styles should
consume these variables instead of creating aliases or duplicating definitions.
Theme settings may still update the token values on the root element at runtime.

## Automated checks

`pnpm --filter @lms/web lint:css` runs Stylelint and the architecture guard. The
Stylelint configuration rejects invalid declarations, duplicate selectors, IDs
beyond the root-level allowance, and selectors above the agreed specificity
ceiling. The guard verifies named-layer imports and unique token ownership.

`pnpm --filter @lms/web build` also enforces an 80 KiB emitted-CSS budget. Change
the budget only with an explanation of the measured impact in the pull request.
Responsive Playwright tests remain the visual-regression gate.
