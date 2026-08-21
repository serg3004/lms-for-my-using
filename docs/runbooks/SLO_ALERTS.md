# SLO alerts runbook

## Service-level objectives

The rolling compliance window is 30 days. Only server failures (`5xx`) count as
availability failures; expected client responses (`4xx`) do not. Objectives are
measured from the bounded HTTP `route` label, not from logs or synthetic checks.

| Journey | Requests included | Availability | Latency objective |
| --- | --- | ---: | ---: |
| Login | `POST /api/v1/auth/login` | 99.9% | p95 <= 750 ms |
| Learner read | learner-facing `GET` course, lesson, assignment, progress and assessment/quiz routes | 99.9% | p95 <= 1 s |
| Assessment submit | `POST /api/v1/assessments/:id/attempts` | 99.5% | p95 <= 2 s |

The monthly error budgets are respectively 0.1%, 0.1%, and 0.5% of journey
requests. The Platform team owns these SLOs and their Prometheus rules. The
on-call Platform engineer is the first responder; page the Engineering Lead if
a critical alert is not acknowledged in 15 minutes, or if more than 25% of a
monthly budget is spent. Escalate confirmed data loss or security impact to the
Incident Commander immediately.

## Triage

1. Acknowledge the alert and open the SLO dashboard. Confirm that traffic is
   non-zero and inspect the affected journey, status codes and p95 latency.
2. Check API deploy events and correlate application logs/traces with a recent
   `X-Request-ID`. Never paste tokens or request bodies into the incident channel.
3. Compare PostgreSQL pool, Redis errors, S3 latency and queue depth. For a
   scrape failure, check `/api/v1/metrics` privately with its bearer token.
4. Roll back the latest deploy when timing and symptoms correlate. Otherwise
   reduce load or disable the failing dependency path using an approved
   operational control. Do not weaken authentication or tenant isolation.
5. Resolve only after the alert clears and both error ratio and latency remain
   healthy for 15 minutes. Record cause, budget spent and follow-up owner.

`LmsSloFastBurn` is a page: its threshold consumes roughly 2% of a 30-day error
budget in one hour if sustained. `LmsSloLatencyHigh` and `LmsSloNoTraffic` are
ticket/chat alerts during business hours unless they accompany user impact.

## Alert-routing drill

Run quarterly and after changing Alertmanager routing:

1. Notify the Platform on-call that this is a drill.
2. Add `infra/monitoring/prometheus/test-alert.rules.yml` to the Prometheus
   `rule_files`, reload Prometheus, and confirm `LmsAlertPipelineTest` reaches the
   expected receiver with its runbook link within five minutes.
3. Record timestamp, receiver and acknowledging engineer in the drill log.
4. Remove the test rule from `rule_files`, reload, and confirm the alert resolves.

The synthetic rule is intentionally separate from production rules so it cannot
fire merely by deploying this repository.
