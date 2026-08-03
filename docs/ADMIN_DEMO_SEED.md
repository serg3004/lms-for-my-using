# Safe demo seed task

The demo dataset can only be written through the guarded API admin task. Direct
execution of `prisma/seed.mjs` and `prisma db seed` is intentionally disabled so
an accidental production `DATABASE_URL` cannot mutate a database.

## Dry-run

Build the API, then run the command without flags:

```bash
pnpm --filter @lms/api build
DATABASE_URL='postgresql://user:password@localhost:5432/lms_dev' \
  NODE_ENV=development \
  pnpm --filter @lms/api admin:demo-seed
```

Dry-run is the default. It reads the expected stable demo identifiers and prints
the missing records, but never starts a write transaction. The target summary
contains only the environment, host, port, database, and schema. It never prints
the username, password, full URL, or unrelated query parameters.

## Apply

Copy the environment and database values from the dry-run summary and confirm
both exactly:

```bash
DATABASE_URL='postgresql://user:password@localhost:5432/lms_dev' \
  NODE_ENV=development \
  pnpm --filter @lms/api admin:demo-seed \
    --apply \
    --confirm-environment=development \
    --confirm-database=lms_dev
```

`NODE_ENV=production` is denied by default, including dry-run, to prevent this
task from becoming a production database inspection path. Apply is also denied
when either confirmation is absent or differs from the parsed target.

All writes and post-seed verification run in one Prisma transaction. A write or
verification error rolls back the complete operation. Stable UUIDs and
`skipDuplicates` make a successful repeated apply return `already-complete`
without opening another write transaction.

## Demo-only deployments (`--allow-demo-environment`)

Some deployments run with `NODE_ENV=production` but are not a real production
system — for example a Railway environment that only ever hosts demo/test
data for showcasing the product, with no real end users. For that specific
case, pass `--allow-demo-environment` to lift the production block. The
existing `--confirm-environment`/`--confirm-database` checks still apply in
full, so a typo or the wrong `DATABASE_URL` still aborts the run.

**Only pass this flag if you have personally confirmed the target database
holds no real user data.** It exists to unblock a known demo deployment, not
to make seeding real production safe — the flag does not change that.

```bash
DATABASE_URL='postgresql://user:password@demo-host:5432/lms_demo' \
  NODE_ENV=production \
  pnpm --filter @lms/api admin:demo-seed \
    --allow-demo-environment \
    --apply \
    --confirm-environment=production \
    --confirm-database=lms_demo
```

Dry-run works the same way without `--apply`:

```bash
DATABASE_URL='postgresql://user:password@demo-host:5432/lms_demo' \
  NODE_ENV=production \
  pnpm --filter @lms/api admin:demo-seed --allow-demo-environment
```
