# ADR: CSS design system for frontend UI primitives

**Status:** Accepted (formalizes the existing implementation)
**Date:** 2026-08-22
**Context:** PR 142 — UI foundation: design system decision

## Context

The web application already has a substantial set of screen- and role-specific styles. Before choosing a foundation, the three relevant stylesheets were reviewed:

- `global.css` provides the browser reset, typography, accessible focus treatment, and safe defaults for native controls. These defaults keep older screens usable while they migrate to shared components.
- `ui.css` contains cross-role components and the token-backed `ds-*` primitives, including `Button`, `Input`, and `Badge`.
- `admin.css` contains admin layout and feature styles. It also has older `admin-*` control classes which predate the shared primitives and remain as a compatibility layer for screens not yet migrated.

Two directions were considered:

1. Introduce Tailwind CSS and shadcn/ui.
2. Continue the repository's existing CSS design system, based on custom properties and shared React primitives.

## Decision

**Use the existing CSS design system. Do not introduce Tailwind or shadcn/ui.**

The design-system contract consists of:

- semantic design tokens in `apps/web/src/styles/tokens.css`;
- reusable component styles in `apps/web/src/styles/ui.css`, with the `ds-*` prefix;
- reusable React primitives in `apps/web/src/shared/ui.tsx`;
- base native-control and focus behavior in `apps/web/src/styles/global.css`;
- cascade ordering declared centrally in `apps/web/src/styles/index.css`.

The semantic token contract also covers control sizes, the shared spacing scale,
tenant-derived accent/selected surfaces, and productive motion durations/easing.
Feature code must use these meanings rather than copying brand colors or timing
values. `prefers-reduced-motion` globally collapses non-essential CSS animation
and transition time while preserving immediate state feedback.

New or materially reworked product UI must use the shared React primitives when an appropriate primitive exists. Feature styles may arrange or extend a primitive through `className`, but must not redefine its basic color, typography, spacing, focus, disabled, or error treatment. Native controls are still appropriate for controls with unique interaction or layout needs, and receive consistent fallback styling from `global.css`.

## Rationale

- **It matches the current architecture.** Tokens, cascade layers, `ds-*` styles, and shared components are already present and used across admin and manager screens. Replacing them would create two competing styling systems during a long migration.
- **It avoids unnecessary runtime and build complexity.** The required primitives do not need Tailwind's compiler, class scanning, configuration, or shadcn's additional component dependencies.
- **It keeps the visual contract easy to audit.** Semantic tokens are declared in one small CSS file and the component rules are ordinary CSS rather than utility strings distributed through JSX.
- **It preserves incremental migration.** Existing learner and admin feature classes can keep working while touched screens move to `Button`, `Input`, and `Badge`; a framework switch would require a broad, high-risk rewrite unrelated to product behavior.
- **It supports runtime theming and accessibility.** Existing semantic variables feed the runtime theme implementation, while global and component rules retain visible focus, disabled, and error states.

## Primitive contract

The baseline primitives are:

- `Button`: primary, secondary, ghost, and danger variants; small and medium sizes; native button attributes and disabled behavior.
- `Input`: optional label, hint, and error message; shared field spacing; error and focus states; native input attributes.
- `Badge`: semantic status variants backed by the shared color tokens.

Their render coverage lives in `apps/web/src/shared/ui.spec.tsx`. Every baseline primitive has at least one render test, including its default appearance and a meaningful variant or state.

## Migration policy

- Do not perform a repository-wide mechanical replacement of native controls or legacy classes. Specialized navigation, upload, segmented, and editor controls have different interaction contracts and should be migrated only when their owning screen is changed and verified.
- Prefer `Button`, `Input`, and `Badge` in new UI.
- Treat `.admin-btn`, `.learner-btn`, `.ui-status-badge`, and feature-specific input rules as compatibility styles, not APIs for new code.
- Add a semantic token before copying a literal color into a reusable component.
- Use motion tokens for state transitions; motion must explain appearance,
  feedback, or progressive disclosure rather than decorate static content.
- Add or update a render test whenever a shared primitive's public variants change.

## Consequences

- Tailwind and shadcn/ui are not added to the frontend dependency graph.
- `tokens.css`, `ui.css`, and `shared/ui.tsx` are the source of truth for reusable visual primitives.
- `global.css` remains intentionally conservative so legacy native controls have a consistent baseline.
- `admin.css` remains feature-scoped; its legacy primitive-like rules may be retired incrementally as screens adopt shared components.
- The current `Button`, `Input`, and `Badge` implementation and tests satisfy the PR 142 baseline; this ADR supplies the previously missing architectural decision and migration boundary.
