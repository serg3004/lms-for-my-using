# Checklist workplace-training session workflow

`ChecklistSession` (PR 285-307, `docs/architecture/adr/ADR_CHECKLIST_SESSION_OVERLAY.md`) is a
distinct mode from the older assignment/review workflow documented in
[`CHECKLIST_ANALYTICS_REVIEW_WORKFLOW.md`](./CHECKLIST_ANALYTICS_REVIEW_WORKFLOW.md) and
[`CHECKLIST_COMPLETION_CONTRACT.md`](./CHECKLIST_COMPLETION_CONTRACT.md): a scheduled, observed,
in-person evaluation (someone watches someone else perform a task and scores it live), not a
self-paced form an employee fills in alone. This is a per-role navigation aid across the detailed
per-PR contracts in [`API_CONTRACTS.md`](./API_CONTRACTS.md); it does not restate mechanics already
covered there or in the RBAC matrix -- see [`API_RBAC_MATRIX.md`](./API_RBAC_MATRIX.md) for the
authoritative policy/scope for every endpoint named below.

`ChecklistWorkplaceSettings.moduleEnabled` (tenant-off by default) is currently a stored/displayed
preference only -- at this SHA no session route, controller, or nav item reads it to gate access,
so setting it to `false` does not disable the module for a tenant's users; treat it as a
not-yet-enforced setting, not an access-control gate, until a guard actually checks it. The module
adds exactly one new top-level nav item across every role, `/manager/checklists` -- everything else
below is a sub-route or contextual dialog of an existing screen.

## Admin (`/admin/checklists/sessions`)

Creates and schedules sessions via a 4-step wizard (participants -> checklist -> schedule/location
-> confirm), single or bulk (PR 295/292); manages the workplace settings dialog from the same
screen's header (`ChecklistWorkplaceSettingsDialog`, PR 286/305); opens a per-session report
(`/admin/checklists/sessions/:id`, PR 300) with Summary/Participants/Criteria/Files/History tabs;
recalculates a session's score with a required audited reason (`POST .../recalculate`, PR 300);
reads exact location captures through the existing audited administrator read path (PR 304).
Admin alone can recalculate and has tenant-wide report access. Conduct is separate: PR 352
requires the administrator to be the assigned observer, just like every other role; neither a
report read nor administrator status authorizes conducting or sending location for someone else.

The recalculation dialog (PR 335) offers **Checklist settings** (the assignment's original points
and weights, also the default for older clients) and **By criteria** (marked / non-skipped total,
equal weight). A selected scale level counts as a mark; rejected answers earn nothing. A reason
is required. After saving, the dialog shows the actual before/after; close it to return to the
report. Summary and History show each immutable revision's formula. Retrying an unchanged failed
request reuses its idempotency key; changing the formula/reason starts a new operation. The
original revision is returned on replay and never rewritten. See `API_CONTRACTS.md` for skip,
not-scored, scale and snapshot semantics.

The schedule step supports **Same for everyone** and **Set each separately** (PR 329). A shared
schedule keeps the existing Start now / Schedule for later behavior and accepts an optional
duration. Individual scheduling requires a date/time for every selected employee and allows an
optional duration for each (1–1440 minutes). Switching modes or navigating back/forward preserves
edits; removed employees are excluded from the submitted schedule. The confirmation step shows
each employee's appointment and duration before creation. Individual appointments are created as
scheduled sessions and are never auto-started, even if the shared mode was previously Start now.

The displayed timezone is the browser's IANA timezone, as in PR 303. Local datetime inputs are
converted to absolute UTC instants; invalid dates and nonexistent local times at a spring DST
transition block progression instead of silently moving the appointment. An ambiguous autumn
hour retains the browser's existing earlier-offset behavior. Session reads and reminders retain
each session's declared timezone/instant; see the PR 329 bulk contract in `API_CONTRACTS.md`.

## Manager (`/manager/checklists`, and the admin session screens scoped to their team)

Manager shares the admin session-list/wizard/report screens (`checklistSessionsManage`:
create/reschedule/cancel), scoped to their effective team (Group ∪ Department DIRECT ∪
ReportingLine DIRECT) by `sessionManagementScope()`. A manager can schedule and reschedule
sessions for their reports, conduct only sessions assigned to them as observer (even outside their
team), and cannot recalculate a score (`checklistScoreRecalculate` is admin-only). Their own
conduct queue is also embedded in «Моя команда»; it never includes their team's other sessions. `/manager/checklists` (PR 299, the module's one new
nav item) is a dashboard, not a session-management screen: period-scoped aggregate cards, a
distribution/trend chart with an accessible table fallback, and an employee table with per-employee
drill-down into their sessions -- all through `GET /checklists/manager-analytics`
(`checklistManagerAnalyticsRead`), scoped the same way.

PR 461 adds the analytics over several sheets, beside it and without changing it: an administrator gets a fourth tab «Аналитика» in the strip of the Checklists page (`/admin/checklists/sheet-analytics`); an instructor and a mentor get the tab «Аналитика листов» next to their employee analytics (`/instructor/checklists/sheet-analytics`, `/mentor/sheet-analytics`); a manager switches «Сотрудники / Чек-листы» on `/manager/checklists` (the sheets view is `/manager/checklists/sheets`). The tab reads `GET /checklists/analytics/sheets` and `/overview` (PR 459); its state (period, sheets, department, manager) lives in the address bar.

PR 462 opens one sheet by its items: the button «Аналитика» in the bar of selected checklists (library of an administrator, an instructor and a mentor; one or several sheets) opens the tab with those sheets preselected (`?sheets=id,id`). With exactly one sheet chosen, a section under the overview shows the cuts «Критерии / Группы / Обратная связь / Примечания» from `GET /checklists/:id/analytics/items`: criteria and groups with completion, average score, answered/left and notes, search by text, sorting, and a tick per row that recounts the total (and the level bars) over the ticked rows from the raw score sums; feedback with filled/not filled and the spread of chosen options; notes filtered by criterion, newest first, paged, with a link to the session report where the role has one. A cut with nothing to show (no groups, no feedback) is hidden; a sheet without sessions in the period, a deleted sheet and a sheet outside the viewer's access get their own messages. Cut, search, ticked rows, notes criterion and notes page live in the address bar (`cut`, `qi`, `pick`, `note`, `np`).

PR 464 stores the settings of the link/QR entry of a free sheet (off / for registered users / for everyone, guest name rule, guest photos off by default). Only an administrator switches it or reissues the link; it can be on only for a published sheet with free access, and moving the sheet to draft, archive or «по назначению» switches it off. The guest pass itself (PR 465) belongs to a service user «Guest» with the typed name stored on the session.

PR 465 makes the link work for guests: a guest opens the link, types a name (when the sheet asks for it), solves the picture code and starts a pass; answers are saved as for an employee and the result is sent with a fresh code. The sheet's «registered» audience sends a guest to sign in first. Switching the entry off or reissuing the link stops open guest passes at once and marks them «link disabled»; a sheet has a daily limit of guest passes (default 200). Guest photos stay off unless allowed on the sheet.

PR 466 puts the entry by link and QR code into the sheet's settings (card «Прохождение чек-листа», only for «Свободное прохождение»): one audience switch (off / registered / everyone) for both, guest name required or optional, guest photos (off by default), the guest passes per day, the link with «Скопировать» and the QR code with PNG and SVG download. Only an administrator changes anything; others see the state. Switching on, switching off and reissuing each ask for confirmation that says what stops working; the warning about an open-to-everyone link stays on the screen while that mode is on. The link is `/c/<token>`.

PR 467 adds that page, `/c/<token>`, outside the application shell and without its menu. A guest sees the sheet's name and description, types a name (when the sheet asks for it), solves the picture code and passes the sheet with the same screen as an employee; sending asks for a fresh code and ends on a thank-you screen with the result the sheet allows, and «Pass again» starts a new session. The pass key is kept in the browser, so a reload continues the pass. For «registered only» a visitor who is not signed in goes to the sign-in page and comes back to the link; a signed-in employee continues under their own account. A revoked, replaced or unpublished link shows one «this link does not work» page. A sheet that requires photos cannot be finished while guest photos are off, so the page says so before the guest starts.

PR 468 shows a guest wherever results are shown. A guest pass stays a result (`ChecklistInstance`) of the organization's service user, with no session row (a session needs an observer), so guests are not in the sessions list, like results an employee finished on their own. An instance read returns `isGuest` and `guestName`, and the screen reads «Guest: name» (or «Guest» when no name was given) with «by link or QR». The review queue takes `guests=only|hide`, which narrows what the viewer's own scope already allows. Analytics counts guests in the totals and shows them on their own line (the export has the same line); a guest belongs to no department and no manager's team, so a manager's view and the department and manager filters never contain guests.

PR 463 adds «Скачать CSV» and «Скачать Excel» to the overview table and to every cut of one sheet. The file is the current view of the screen from `GET /checklists/analytics/export`: the same period, filters, ticked rows, search and sorting, a total row, the answers-by-scale-level block, and the whole notes list for the notes cut; an empty view downloads nothing and says so. Access is the screen's own and the audit log keeps counts and filter ids only.

### Report by manager (PR 356)

«По руководителям» shows employees, completed sessions and average reviewed results for both
primary direct and functional managers of the employee's current primary department. The same
person holding both roles counts once; two different managers each receive the employee, so these
rows can overlap. Overall employee totals remain unique. «Без руководителя» groups employees
without either current primary manager. Missing scores display a dash.

The manager filter survives reload in the URL and combines with the period, checklist and department
filters. Each manager table has its own CSV/Excel buttons using the same scoped server data;
employee-only search/result toggles continue to affect the employee table/export. Managers see
only their existing zone. Administrators open the dashboard from the sessions page's analytics
link (`/admin/checklists/analytics`). The primary reporting associations do not grant access rights.

## Assigned observer (shared `/instructor/checklists/sessions` list/detail)

The observer's session list at `/instructor/checklists/sessions` includes “New session” (PR 331).
It opens the shared mobile wizard with the signed-in instructor fixed as observer and no change
or observer-search control. Employee lookup has loading, empty and retryable error states;
published-sheet lookup also distinguishes loading, failure and an empty library. Scheduling,
individual appointments and optional duration use the same controls as the admin wizard.
“Start now” creates and starts the observer's own session; scheduled sessions remain scheduled.
Creation refreshes the observer list. Server validation is authoritative: `checklistSessionsCreateOwn`
allows creation only for oneself, within the tenant/manager learner scope described in
`API_RBAC_MATRIX.md`, without granting general scheduling management rights.

PR 352 allows the user named as `observerId` to conduct with any system role (admin, manager,
instructor, mentor or learner). `checklistSessionsRunOwn` always requires that assignment; a
non-observer receives 404 for the conduct read/actions even if they can read the report. The
server also verifies the observer when criteria are answered/skipped or photos are attached.
A user cannot be assigned as observer of their own employee session, in the wizard or by API.
The common queue is hidden without assignments, loads all assigned pages and supports retry.
Learners reach it from «Чек-листы», managers from «Моя команда», mentors from their existing
checklist page, using the same component and shared routes with their existing role shell.
Other instructor routes and general authoring/reporting powers are not granted.

The mobile conduct screen (`ChecklistSessionConduct`, PR 297) has stepped criterion cards
(checkbox, scale, or per-item `ChecklistScale`, PR 293), Skip when allowed, required photos,
one-shot location capture on start/end and structured feedback. The assigned observer sees the
live information needed to conduct, even when their system role is learner; the same person's
employee-session list is filtered separately and retains employee feedback masking.
An unavailable observer reports this themselves via `POST .../observer-unavailable` (PR 302);
reassignment remains a team-scoped manager or administrator scheduling action. Lifecycle audit
names and actors are unchanged. Administrator conduct/location submission for a different
observer is no longer an override path; historical audit records are preserved.

### Sheet overview during conduct (PR 347)

“Sheet overview” opens the assignment snapshot's groups and criteria, with text labels for
answered, skipped and unanswered states and an addressed/total counter. Native buttons jump to
the criterion's original step and move keyboard focus to its heading. Unknown or absent group
IDs appear in “Other criteria”; filtering never changes step identities. New single/bulk
assignments freeze group names/order and criterion membership. Older stored snapshots without
groups use the common list, rather than borrowing group names from the current live checklist.

“Hide answered” shows only unanswered criteria in the overview and skips answered/explicitly
skipped criteria on **Next**. A marked criterion still missing its required photo remains
unanswered. The current card stays in place until navigation; **Back** retains the original step
order. Context and the trailing feedback step are never removed. The filter, current step,
comment drafts and feedback drafts stay in this mounted screen through pause/resume and overview
navigation; comments/feedback retain their existing explicit Save buttons. Reloading or leaving
the screen does not persist unsaved drafts.

An overview jump from required general information uses the same context validation/save as
Next. Navigation, pause/resume, overview and filter controls are blocked while a step save,
feedback save, photo upload or session transition is in flight. Opening/closing the overview does
not unmount the current editor. Failed saves keep drafts available; a conflict still follows the
existing reload flow.

Before Complete, the feedback step reports the number of unanswered criteria (including optional
ones) and offers a jump to the first. With `allowFinishIncomplete`, it explains that unanswered
criteria will be recorded as skipped. The existing required-progress calculation and
`canCompleteSession` gate remain authoritative for the button; these navigation states introduce
no scoring, RBAC or server-validation changes. The existing assignment API carries the frozen
group metadata described in `API_CONTRACTS.md`.

### Photo attachment limits (PR 348)

Before a photo is sent, the conduct screen and the learner checklist page check it on the client:
JPEG, PNG, GIF or WEBP only, not empty and not larger than the server limit (8 MB,
`MAX_BUFFERED_UPLOAD_SIZE_BYTES`). A file that fails the check is never sent; the user sees the
reason ("The file is larger than 8 MB", "Only JPEG, PNG, GIF and WEBP photos can be attached",
"The file is empty") in the existing error area. A hint with the limit sits next to the attach
button (linked with `aria-describedby`). When the checklist forbids gallery photos, the hint adds
that the photo can only be taken with the camera and that this is an interface restriction
(`capture`), not a server check: the server does not know whether a file came from the camera.

The server validation is unchanged and stays authoritative. The web app cannot import API source,
so `checklist-photo-limits.parity.spec.ts` in the API fails if the client limit or the list of
accepted image types ever differs from the server's.

## Learner / employee (`/learn/checklists`)

Three client-side status tabs over the learner's own sessions (`ChecklistInstance.userId ===
self`, PR 298); result visibility is server-enforced, not merely hidden in the UI --
`ChecklistWorkplaceSettings.feedbackVisibility` (`after_completion` by default, or `live`)
decides whether a learner can see the observer's score/structured feedback before the session
reaches `completed`; every other role always sees it. A completed session with every criterion
skipped renders an explicit "not scored" result (PR 306 anomaly #11's `describeChecklistSessionResult()`),
never a blank or misleading `0%`.

## Cross-cutting, not specific to one role

- **Notifications/reminders**: `ChecklistSessionReminderWorker` (PR 291) is a peer of the existing
  `ChecklistDeadlineWorker` on its own job/scheduler id, not a variant of it; `pre_start` (24h
  before `scheduledAt`) and `incomplete_after_start` (24h after `startedAt`) reminders are
  created/moved/suppressed by lifecycle hooks in `create`/`update`/`transition`, DB-idempotent
  independent of the job queue's own retry/backoff.
- **Concurrency/idempotency**: every lifecycle mutation is version/status-conditional inside a
  Serializable transaction; `create`/every transition/`recalculate` additionally accept a
  client-supplied `idempotencyKey` so a network retry replays the original response instead of
  erroring or double-mutating -- see API_CONTRACTS.md's PR 301 section for the full mechanism.
- **Privacy/audit**: administrator exact-coordinate reads and privileged photo-evidence access
  outside a normal review assignment are audited (`checklist_location.accessed`/
  `checklist_evidence.accessed`); routine access by the learner or their assigned reviewer is not,
  since it is already covered by the existing `checklist_item_result.reviewed` entry. Retention/
  deletion policy is an intentionally open owner decision, `docs/status/OPEN_DECISIONS.md`
  DEC-CHKS-002 -- not yet implemented.

## Changes delivered to participants (PR 345)

The existing notification center shows localized notices when a session is assigned, rescheduled
(including duration/timezone changes) or deleted. Both participants receive them; replacing an
observer also notifies the former observer. Bulk scheduling sends each recipient one notice for
the call, including one for a shared observer. Completion notifies the employee, with a link to
that session in `/learn/checklists`; the link works even when the session is outside the first
list page. Detail access and feedback visibility are still enforced by the API. Deleted sessions
and former observers link back to their own list. An unavailable employee session shows a back
action instead of silently opening an unrelated session.

Notice and mail text is generic: it contains no feedback, scores, location or other people's
email addresses. Mail is optional and uses the existing configured delivery capability; portal
notices are persisted with the change regardless of mail availability. Queued mail about an old
change is suppressed after deletion; the deletion notice itself remains deliverable. The
transaction/replay and delivery contract is specified in `API_CONTRACTS.md`.


## Criterion evaluation scales (PR 358)

A criterion's own scale determines its buttons, earned points, maximum and completion. A valid
zero-point selection such as "No" is an answer; it still needs evidence if the criterion requires
a photo. Without a criterion scale the existing checklist scoring applies. Skipped criteria do
not contribute to either side of the total, and weights apply to both sides. Learner answers,
observer progress and builder previews follow the same per-criterion rules. New criteria select
the protected Yes/No scale by default; selecting "No scale" retains checklist-level scoring.

Assigned instances read scale levels from their immutable snapshot. Later live edits/archival do
not change those definitions or saved completed scores. No historical recalculation runs on
release or when opening a report; administrator-requested recalculation remains explicit and
audited, using the snapshot. Saving a comment preserves an existing scale answer.


## Import employees to sessions (PR 364)

The existing sessions page offers «Импорт списка» to the four scheduling roles. The same wizard
accepts a UTF-8 CSV or one-sheet XLSX with a single `email` column (up to 100 data rows, 1 MiB),
then shows accepted/skipped rows with reasons before creation. Observer, published checklist,
time, duration, timezone and location policy are shared by the list. The instructor remains their
own observer. Replacing the file clears the previous preview and selection. No sessions are
created by preview. Final import rechecks the current employee scope and creates only eligible
rows; a duplicate, invalid email, inaccessible employee, self-observer or existing active
assignment is reported per row. The final report remains visible until the wizard closes.

The UI keeps an operation ID across a network retry with the same file/settings. Previously
created rows are replayed without duplicate sessions, snapshots, reminders or notifications;
starting a new import is a separate operation. Standard "conduct now" behavior applies when that
schedule is explicitly chosen; a scheduled import creates sessions to be conducted later. Files
and raw emails are not retained in audit metadata; the import event records the executor and counts.

## Detailed session report (PR 370)

`GET /checklist-sessions/:id/report` returns one object for the report screen, PDF and XLSX:
`header` (status, timezone, planned and actual period, learner and observer with primary
department), `generalInfo`, `summary` (percentage, earned, maximum, criteria count, skipped count,
passed, formula, range colour), `groups` (number, title, earned, maximum, percentage, colour),
`criteria` (number such as `2.3`, text, `state` answered/skipped/unanswered, earned and maximum,
scale level name, comment, photo file name, review status, colour), `feedback` and `location`.
Skipped criteria are excluded from the maximum. Numbers follow group order then criterion order;
ungrouped criteria are numbered after the groups. Scores use the same calculation as the stored
instance score (`snapshot` points x weight, or the `criteria` formula after a PR 362 revision), so
the report total equals the sessions list and analytics. Old snapshots without level colours get the
default colours. Each colour is returned as `{ color, light: { fill, text }, dark: { fill, text } }`
with AA-contrast text. When `feedbackVisibility` hides the result from a learner the response carries
only the header and `visible: false`.

### Report screen (PR 371)

The "Summary" and "Criteria" tabs of `AdminChecklistSessionReportPage` (admin, instructor and mentor
shells) render only this report: the client never calculates a score, a percentage, a number or a
colour. Rows are painted with the server's `light` fill and text and a coloured left stripe (inline
values, no new CSS); every highlighted row also carries a symbol and a text label (full score,
partial score, no points, skipped, no answer), so colour is not the only carrier of meaning. The
"Files" and "History" tabs, recalculation, result deletion and the on-behalf location entry keep
their own requests. After a recalculation the report is refetched.

### Report PDF (PR 372)

`GET /checklist-sessions/:id/report.pdf` renders the same report object (never a second calculation)
as `application/pdf` (`Content-Disposition: attachment`, `Cache-Control: private, no-store`). It reuses
the report's route policy (`checklistSessionsRead`), `sessionScope()`, tenant filter and learner
feedback-visibility masking: a session outside the caller's zone or tenant is a 404, and a learner
whose result is still hidden receives a header-only file. Every download is audited as
`checklist_session.report_pdf_downloaded` with the locale, size and photo counts, never the content.
The file language is the downloader's interface language (`ru`, `en`, `kk`, `zh`, default `en`).
Content: header, general information, total ring with percentage and points, groups with bars,
criteria table with score, scale level and comment, feedback, photos with captions. Rows use the same
owner-chosen colours as the screen (fill, left stripe, ring, group bars) and a vector icon per state
(tick, triangle, cross, dash, dot), so black-and-white print stays readable. Fonts: Noto Sans and
Noto Sans SC (SIL OFL 1.1, see `docs/runbooks/PDF_FONTS.md`); a character no font covers prints as `?`.
Limits: at most 40 photos (JPEG and PNG, up to 4 MB each and 16 MB in total; the rest are counted in a
note "photos not included"), 30 seconds for the whole build (504 `GatewayTimeoutException`) and 25 MB
for the file (413 `PayloadTooLargeException`). The web button "Download PDF" sits next to "Print" and
shows the server's message on failure.

## Checklist editor: what is saved at once and what by the button (PR 417)

Criteria, groups, the fields of "General information", photos and scales are saved at once (each change is its own request).
The title, description, scoring, threshold, access and "Module settings" are the sheet **settings** and are saved by **Save**.
To keep typed settings from being lost:

- **Publish** and **Preview** first save unsaved settings; Publish sends them together with `status: 'published'` in one `PATCH /checklists/:id`, so a sheet is never published with old settings. If the request fails, the sheet is not published (or the preview does not open), the server message is shown under the page header, and the form keeps what was typed;
- while the settings differ from the saved ones, a bar "There are unsaved changes" with **Save** and **Discard** (restores the stored values) is shown above the editor;
- leaving with unsaved settings (the "All checklists" link, a link of the menu, closing the tab) asks "Save / Don’t save / Stay"; an in-app link is intercepted in the capture phase and followed after the choice, the tab close uses the browser's own prompt;
- settings are not autosaved; only people who may edit the sheet see the bar and the prompt.

## Checklist editor: reordering lists (PR 418)

Every list that is edited by hand in the checklist editor can be reordered with the ↑/↓ buttons, by the "⋮⋮" handle (mouse, touch, keyboard: Space/Enter picks up, arrows move, Space/Enter drops, Esc cancels) and, for a field, from its "⋮" menu and the right-button menu (Move up / Move down). Only people who may edit the sheet see the handle and the arrows.

| List | Where the order is stored | When it is saved |
|---|---|---|
| Groups and criteria | `order` of each group and criterion (`PUT /checklists/:id/layout` for a drag, per-row `PATCH` for the arrows) | at once (PR 402) |
| Fields of "General information" | `contextFields[].order` | at once, all named fields in one `PATCH /checklists/:id`; `order` is rewritten 0, 1, 2, … by position; if the request fails the old order comes back and an error is shown |
| Scale levels of the sheet (scoring "Own scale") | position in `scaleLevels`; the `level` number is the identity of a level (answers refer to it) and moves with its row | with the other settings by **Save** (PR 417) |
| Sections and fields of the structured feedback, answer sets, levels of a reusable scale | position in the list | as before (PR 405, PR 296) |

The observer screen and the report show "General information" in the saved order. A session that has already started keeps the list it was started with (`contextFieldsSnapshot`), so a later move does not change it.
