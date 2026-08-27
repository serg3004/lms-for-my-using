# Load-testing baseline (PR 211)

The versioned k6 baseline exercises login, refresh and bounded learner lists. Assessment submission and buffered upload are available only with separate write opt-ins because they create data and invoke storage/scanning integrations.

## Dataset and environment

Copy `load-tests/dataset.example.json` outside the repository and provide one credential per expected concurrent session. A meaningful staging dataset has at least 100 organizations; a large tenant has 10,000 users and 1,000,000 progress, assignment, attempt and notification rows, matching the query audit. Use distinct users wherever possible so authentication/session contention is representative. Assessment IDs, valid answer payloads and upload material IDs must refer to isolated, disposable records.

Do not put passwords in the dataset. `passwordEnv` names the environment variable that holds each password. Result JSON may contain target metadata and must be stored as restricted deployment evidence, not committed.

## Running profiles

Install k6, then run from `load-tests/`. Every target requires an exact hostname acknowledgement, so a missing or misspelled variable fails before traffic starts.

```bash
cd load-tests
BASE_URL=https://api-staging.example.com/api/v1 \
LOAD_TEST_ALLOW_HOST=api-staging.example.com \
LOAD_TEST_DATASET=./dataset.staging.json \
LOAD_TEST_PASSWORD='from-secret-manager' \
LOAD_TEST_PROFILE=smoke \
k6 run --summary-export=results-smoke.json baseline.js
```

Run `smoke`, then `load`, then `stress`; stop when an acceptance threshold fails or infrastructure telemetry becomes unhealthy. The profiles ramp respectively to 1, 25 and 150 virtual users. Set `LOAD_TEST_ENABLE_WRITES=true` only for disposable assessment data, and `LOAD_TEST_ENABLE_UPLOADS=true` only when disposable storage and malware-scan capacity are ready.

Production-like hostnames have a second guard. Production execution is not part of the baseline and requires an approved change window plus both `LOAD_TEST_ALLOW_PRODUCTION=true` and `LOAD_TEST_PRODUCTION_CONFIRM=I_UNDERSTAND_THIS_CREATES_LOAD`.

## Acceptance and evidence

k6 reports throughput, error rate, checks and HTTP p50/p95/p99. The starting end-to-end budgets are p50 below 250 ms, p95 below 750 ms, p99 below 1,500 ms, and error rate below 1%. Treat these as an initial contract to revise from measured staging evidence, not a claim that unexecuted capacity is known.

Record the highest load stage that passes all thresholds as **safe concurrency**. For each stage retain the k6 summary plus API replicas/CPU/RSS, PostgreSQL connections/CPU/slow queries, Redis latency/errors, object-storage latency and queue depth. Compare RSS and database connection counts at equal traffic near the start and end of each plateau; sustained growth after traffic returns to baseline fails the leak check. Correlate database p95 with the 150 ms query budget in `PAGINATION_QUERY_PERFORMANCE_AUDIT.md`.

The repository cannot truthfully fix a safe-concurrency number or assert leak freedom without a production-shaped staging run. Attach dated evidence and the dataset cardinalities to the pull request or release record after execution.
