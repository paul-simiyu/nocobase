# Workspace ↔ CRM event contract

Version 1. This document is the contract between the Workspace (this NocoBase app) and the
CRM. It describes what crosses the wire, what each side guarantees, and what is deliberately
not automatic.

The Workspace half is implemented in `@nocobase/plugin-crm-integration`. The CRM half is a
separate application in its own repository with its own database.

---

## 1. Shape of the integration

Two engines, not one brain. Each app keeps its own rules, its own database and its own
workflow engine. They share one mail tray.

- **Events** are asynchronous and travel over Redis streams. Each app appends to its own
  stream and reads the other's.
- **Actions** are synchronous and travel over a localhost-only HTTP API. Each app exposes a
  narrow set of permitted actions; that API is both the contract and the audit log.
- **Neither app ever writes into the other's database.** Not even sharing a server.

Identity is solved before anything else. There are no foreign keys across the boundary, so
both sides keep a link table and everything hangs off a canonical `organisationUuid`.
Payloads carry UUIDs only, never auto-increment ids.

---

## 2. Transport

| Setting | Environment variable | Default |
|---|---|---|
| Stream the CRM writes and the Workspace reads | `CRM_INTEGRATION_CRM_STREAM` | `crm.events` |
| Stream the Workspace writes and the CRM reads | `CRM_INTEGRATION_WORKSPACE_STREAM` | `workspace.events` |
| Workspace consumer group | `CRM_INTEGRATION_CONSUMER_GROUP` | `workspace` |
| Internal API shared token | `CRM_INTEGRATION_INTERNAL_TOKEN` | *(unset — the API stays shut)* |

Redis connection details come from the host application's own Redis configuration
(`redisConfig` / connection string). With no Redis configured the Workspace still records
outbound events in its outbox and simply does not publish them; nothing is lost.

Each side reads through a consumer group, so a restart resumes where it left off rather than
replaying from the beginning.

### Outbox

Both apps write events to an `outbox` table in their own database, in the same transaction
as the business change that caused them. A worker drains that table onto the stream. The
outbox is what makes replay possible when Redis drops a message — the row is the durable
record, the stream is only the delivery.

Workspace behaviour on a publish failure: the row stays `pending`, `attempts` increments and
`availableAt` backs off (2s, 4s, 8s … capped at 5 minutes). After 10 attempts it is marked
`failed` and left for an operator.

---

## 3. Envelope

Every message on either stream is a single JSON document in the stream field `data`:

```json
{
  "uuid": "c41d8a92-77b6-4a1e-9a3f-2d5c6e7f8a9b",
  "name": "crm.deal.won",
  "source": "crm",
  "origin": "user",
  "depth": 0,
  "occurredAt": "2026-02-11T14:02:07.000Z",
  "payload": {}
}
```

| Field | Meaning |
|---|---|
| `uuid` | Idempotency key for the whole event. The consumer claims it before handling, so a redelivery finds its own row and stops. Must be unique per event, not per delivery. |
| `name` | Always prefixed by origin system: `crm.*` or `workspace.*`. |
| `source` | `crm` or `workspace`. |
| `origin` | `user`, `automation` or `system`. Half of the loop guard — see §6. |
| `depth` | Hops travelled. The consumer refuses anything at depth 8 or more. Increment it when an event is emitted as a consequence of another. |
| `occurredAt` | ISO 8601, UTC. |
| `payload` | Per-event, below. UUIDs only. |

An event that cannot be parsed, or that has no `uuid` or `name`, is dropped and logged. It is
never claimed, so a corrected republish under the same UUID will still be processed.

---

## 4. Events the CRM emits

Sample envelopes for all of these live in `fixtures/`.

### `crm.organisation.upserted`

Sync this first. Deal-to-project and contact-to-member both hang off `organisationUuid`;
without it the two systems end up matching on client names within months.

| Field | Type | Required |
|---|---|---|
| `organisationUuid` | string (UUID) | yes |
| `name` | string | yes |
| `primaryContactName` | string | no |
| `primaryContactEmail` | string | no |

Upsert semantics, keyed on `organisationUuid`.

### `crm.deal.won`

Provisions the client portal. Fire this as a **dedicated event, not a stage change**: stage
changes are noisy and deals bounce between Concept and Design, whereas winning is a
deliberate act.

| Field | Type | Required |
|---|---|---|
| `dealUuid` | string (UUID) | yes |
| `organisationUuid` | string (UUID) | yes |
| `serviceType` | `brand_strategy` \| `visual_identity` \| `web_design` \| `user_experience` | yes |
| `organisationName` | string | no — upserts the organisation if present |
| `dealName` | string | no — becomes the project name |
| `clientContactName`, `clientContactEmail` | string | no |
| `stage` | CRM stage | no — defaults to `strategy` |

Provisioning is idempotent on **(deal, service type)**, enforced by a unique index rather
than only by a lookup. A deal reopened and re-won resumes the same portal; it never spawns a
second one. A multi-service deal gets one project per service — send one event per service.

An unknown `serviceType` fails the event rather than guessing.

### `crm.deal.stage_changed`

Keeps the Workspace's mirror of the deal in step. The Workspace never emits anything in
response, which is what stops the two listeners ping-ponging.

| Field | Type | Required |
|---|---|---|
| `dealUuid` | string (UUID) | yes |
| `stage` | `strategy` \| `concept` \| `design` \| `production` | yes |
| `previousStage` | CRM stage | no |
| `manual` | boolean | no — `true` when a person moved the deal by hand |
| `changedByName` | string | no |

`manual: true` sets `stageSetManually` on the mirror, which makes the Workspace ratchet stand
down and log a conflict instead of overwriting the decision (§6). To hand control back to
automation, send a `crm.deal.stage_changed` with `manual: false`, or one with
`origin: "automation"` — either clears the flag.

A stage change for a deal the Workspace has never seen is ignored, not an error.

---

## 5. Events the Workspace emits

### `workspace.milestone.approved`

Fires when a client closes a gate (`approve` or `approve_with_conditions`). This is the event
that ratchets the deal stage.

| Field | Type |
|---|---|
| `projectUuid`, `dealUuid`, `organisationUuid` | string (UUID) |
| `milestoneName` | string — named plainly for the client, e.g. "Identity direction" |
| `phaseName` | string |
| `approvalUuid` | string (UUID) |
| `action` | `approve` \| `approve_with_conditions` |
| `approvedByName` | string — captured at the time of approval |
| `approvedAt` | ISO 8601 |
| `conditionsText` | string, present on `approve_with_conditions` |
| `artifactSnapshot` | array of `{ fileUuid, name, versionLabel, versionHash? }` |

`request_changes` does **not** emit this event. The phase stays open and the revision counter
increments.

The CRM should write this to the deal as an activity note naming who approved what, when.
Conditions from `approve_with_conditions` need to reach whoever owns the work — otherwise the
client's "just one small thing" lands nowhere.

### `workspace.project.stage_reached`

Fires when the ratchet has decided the deal should move forward. Always `origin: automation`.

| Field | Type |
|---|---|
| `projectUuid`, `dealUuid`, `organisationUuid` | string (UUID) |
| `stage` | the stage the deal should now be at |
| `previousStage` | the stage the Workspace believed it was at |
| `phaseName` | the phase now active |
| `reason` | human-readable, e.g. "Identity direction approved by Ada Okonkwo" |

**The CRM must not echo this back as a `crm.deal.stage_changed` with `origin: user`.** Echo
it with `origin: automation` or not at all.

### `workspace.project.completed`

Fires when a project's final phase closes.

| Field | Type |
|---|---|
| `projectUuid`, `dealUuid`, `organisationUuid` | string (UUID) |
| `finalPhaseName` | string |
| `completedAt` | ISO 8601 |

Reaching Production is not the same as the project being done, and neither is the same as the
deal being closed out. **Closing out a deal stays a human action** — that is where invoicing,
retrospectives and the case study request hang.

### Reserved, not yet emitted

`workspace.request.opened`, `workspace.task.completed` and `workspace.proof.approved` are
named in the contract and defined in code, but nothing emits them yet. They arrive with the
client contribution lane. `workspace.request.opened` in particular is a scope signal: it
should reach the CRM as deal activity flagged for review, which is how change orders and
upsells stop getting lost in comment threads.

---

## 6. Guardrails

The deal stage is a **ratchet**: it turns one way only. Approvals click it forward; nothing
clicks it back automatically.

| Guardrail | Rule | Where |
|---|---|---|
| Forward-only | Stage indexes are compared. The Workspace never emits a backwards move. Genuine backward movement is a person's job, in the CRM. | `delivery/advancement.ts` |
| Least-advanced wins | On a multi-service deal the stage is the **earliest** stage across all tracks, so a finished Visual Identity track cannot drag the deal to Production while Web is still in Design. | `computeDealStage` |
| Idempotency | Inbound: the event UUID is claimed in the inbox before the handler runs. Approvals: a unique `idempotencyKey` per submission, so a double-click cannot double-fire. Provisioning: unique on (deal, service type). | `bus/dispatcher.ts`, `delivery/approvals.ts` |
| Loop guard | `origin` plus a maximum `depth` of 8. A stage change carrying `origin: automation` is mirrored and not re-emitted. | `bus/dispatcher.ts`, `handlers/deal-stage-changed.ts` |
| Manual override respected | If a person set the stage by hand, automation logs a conflict on the deal mirror (`conflictNote`, `conflictAt`) and stands down rather than silently overwriting. | `syncDealStage` |

A failed handler acknowledges its message on the stream so one poison event cannot block
everything behind it; the inbox row holds it as `failed` for an operator to replay.

---

## 7. Internal actions API (Workspace side)

Localhost only, and every call must carry the shared token in the `x-internal-token` header.
With `CRM_INTEGRATION_INTERNAL_TOKEN` unset the API returns 503 and refuses everything —
the door stays shut rather than swinging open.

```
POST /api/crmInternal:createProject
POST /api/crmInternal:provisionClientPortal
```

Body: `{ "values": { "dealUuid", "organisationUuid", "serviceType", "projectName?",
"organisationName?", "clientContactName?", "clientContactEmail?" } }`

`provisionClientPortal` returns the project plus a **signed, expiring invite**, which appears
in that response and nowhere else — only its SHA-256 hash is stored. It never generates a
password. A second call for the same deal and service returns `created: false` and re-issues
an invite only if the previous one has expired.

The CRM is expected to expose the mirror of this for `updateDealStage` and `logDealActivity`.

### Delivery actions (Workspace-internal, not for the CRM)

```
POST /api/deliveryPhases:requestApproval   # studio: put a gate up for client approval
POST /api/deliveryPhases:completePhase     # studio: finish ordinary work, light up the next phase
POST /api/deliveryPhases:submitApproval    # client: approve / approve with conditions / request changes
```

---

## 8. Phase tracks and stage mapping

Four tracks ship seeded and versioned. In-flight projects pin the version they started on, so
revising a track cannot reshape work already under way — bump `version` rather than editing.

| Track | Phases | Gates |
|---|---|---|
| Brand Strategy | Discovery → Research & Audit → Positioning → Strategy Presentation → Handover | Discovery, Positioning |
| Visual Identity | Discovery → Concept Development → Direction Selection → Refinement → Asset Delivery | Direction Selection, Refinement |
| Web Design & Development | Discovery → Information Architecture → Design → Development → Testing & QA → Launch | IA, Design, Testing & QA, Launch |
| User Experience Design | Discovery → Research → Structure & Flows → Prototype → Usability Testing → Handover | Research, Prototype |

Every phase carries a `crmStage`. The deal's stage is the stage of the current phase, subject
to the guardrails above.

**Known inconsistency, carried forward deliberately.** The source spec says every track ends
on a client-approval gate before delivery, but the gate lists it gives place the last gate of
Brand Strategy at Positioning and of User Experience at Prototype — both mid-track. The seeds
follow the explicit gate lists rather than inventing gates. If the intent was a final delivery
gate on all four tracks, add it as track version 2.

---

## 9. Known gaps

These are real and worth knowing before building against this.

1. **The artifact snapshot is caller-supplied.** `deliveryPhases:submitApproval` records the
   file versions the caller says were on screen. Until deliverables exist as first-class
   records, a client could in principle submit a snapshot that does not match what they were
   shown, which weakens the record exactly where it is meant to be strongest. Derive it
   server-side from the gate's own artifacts when the deliverables model lands.
2. **Portal authentication is an ordinary signed-in user.** The invite token is issued and
   hashed, but nothing yet redeems it into a guest session scoped to one project.
3. **No client contribution lane.** Reference uploads, feedback items and requests — and with
   them `workspace.request.opened` — are not built.
4. **Conditions are captured, not actioned.** `approve_with_conditions` stores the text and
   puts it on the event; it does not yet create internal tasks.
5. **No portal read model.** The safer design is a portal that queries a whitelist of item
   types rather than filtering the full project tree behind a `client_visible` flag. Nothing
   client-facing reads project data yet, so this is still open.
6. **Inbound retry is manual.** `EventDispatcher.retryFailed()` exists; nothing schedules it.
