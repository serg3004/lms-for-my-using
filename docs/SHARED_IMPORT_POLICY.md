# Shared import policy

Use explicit `@lms/shared` subpath exports from app workspaces.

## Allowed

```ts
import type { ApiErrorResponse } from '@lms/shared/types/api';
export type { ApiErrorResponse } from '@lms/shared/types/api';
```

## Disallowed

```ts
import { something } from '@lms/shared';
import type { Something } from '@lms/shared';
```

Root imports from `@lms/shared` are intentionally blocked by ESLint. They can pull runtime dependencies into app bundles or Docker builds when only type-only contracts are needed.

When adding new shared contracts, add a focused package export such as `@lms/shared/types/<area>` and import that subpath from API or Web.
