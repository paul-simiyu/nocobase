# @nocobase/plugin-crm-integration

The Workspace half of the Workspace ↔ CRM integration: an event bus, identity links, the
client delivery tracks and the gate approval flow.

Two departments in the same building, each with its own filing cabinet, sharing one internal
mail tray. Neither reaches into the other's cabinet — they drop notes in the tray and act on
what arrives.

## What it does

- **Identity** — syncs the canonical organisation from the CRM and keeps a link table, so the
  two systems never fall back on matching client names.
- **Event bus** — a transactional outbox drained onto a Redis stream, and a consumer group
  reading the CRM's stream with idempotency, depth and origin guards.
- **Provisioning** — `crm.deal.won` creates a project from the track for its service, seeds
  phases and gate milestones, and issues a signed expiring invite. Idempotent, so a deal
  reopened and re-won resumes the same portal.
- **Stage ratchet** — phase progress moves the deal forward in the CRM, forward-only,
  least-advanced-track-wins, and standing down when a person set the stage by hand.
- **Gate approvals** — approve, approve with conditions, or request changes, recorded as an
  immutable receipt with the file versions that were in scope.

## What it does not do yet

The client portal UI, the client contribution lane and the portal read model. See
`docs/contract/events.md` §9 for the full list, including the caller-supplied artifact
snapshot, which matters if you are building the portal next.

## Enabling it

The plugin is discovered from the workspace but is not a built-in, so enable it explicitly:

```bash
yarn nocobase pm enable crm-integration
```

Enabling runs `install()`, which seeds the four service tracks. Upgrades re-seed additively,
so a new track version added in code appears without touching existing ones.

## Configuration

| Environment variable | Purpose | Default |
|---|---|---|
| `CRM_INTEGRATION_INTERNAL_TOKEN` | Shared token for the internal actions API. **Unset means the API refuses every call.** | — |
| `CRM_INTEGRATION_CRM_STREAM` | Stream the CRM writes | `crm.events` |
| `CRM_INTEGRATION_WORKSPACE_STREAM` | Stream this app writes | `workspace.events` |
| `CRM_INTEGRATION_CONSUMER_GROUP` | This app's consumer group | `workspace` |

Redis comes from the host application's own configuration. Without it, outbound events still
accumulate in the outbox and publish once Redis appears.

## Contract

`docs/contract/events.md` is the document the CRM team builds against, with sample envelopes
for every event in `docs/contract/fixtures/`.

## Tests

```bash
yarn test packages/plugins/@nocobase/plugin-crm-integration/src/server/__tests__/provisioning.test.ts
yarn test packages/plugins/@nocobase/plugin-crm-integration/src/server/__tests__/bus.test.ts
yarn test packages/plugins/@nocobase/plugin-crm-integration/src/server/__tests__/approvals.test.ts
yarn test packages/plugins/@nocobase/plugin-crm-integration/src/server/__tests__/actions.test.ts
```

Run them one file at a time; server tests interfere with each other in parallel. The bus is
tested end to end against an in-memory stream, so no Redis is needed.
