# Tender Radar — Implementation Plan

Status as of 14 September 2026 · branch `claude/creative-agency-tender-scraper-lhuufp`
· package `@nocobase/plugin-tender-radar`

A platform that harvests creative-agency service tenders from public procurement
portals, scores how well each notice fits agency work, builds a rule-based **bid
brief**, then hands qualified tenders to the CRM as leads.

---

## 1. Scope

**In scope.** Harvesting from UK, EU, development-bank and NGO sources; relevance
scoring against creative disciplines; deterministic extraction of the facts a bid
decision turns on; a readable brief; on-demand hand-off to a CRM as a lead.

**Out of scope, deliberately.** No LLM in the extraction path. No scheduler of its
own. No opportunity, quotation or order creation — the CRM owns the funnel past the
lead stage. No auto-push of tenders into the pipeline.

---

## 2. Status

Three commits on the branch, 70 files and ~7,300 lines:

| Commit     | Delivered                                                                         |
| ---------- | --------------------------------------------------------------------------------- |
| `3b15c4d8` | Harvest engine, six source adapters, scoring, extraction, bid brief, HTTP actions |
| `6f162bf1` | Bid brief panel, Harvest now button                                               |
| `328d80d0` | CRM lead hand-off, `crmTargets` config, Send to CRM button                        |

**188 tests pass. All source files type-check clean under `--strict`.** Neither
`yarn test` nor `yarn eslint` has run — see §7 for exactly what that means.

---

## 3. Architecture

### 3.1 Layering

The package separates **pure logic** from **I/O** throughout, which is what makes
the bulk of it testable without a database, a network or a React renderer:

```
src/shared/     pure — no NocoBase, no axios, no React. Scoring, parsing, briefs.
src/server/     I/O — repositories, HTTP adapters, orchestration, actions.
src/client/     UI — three flow models; pure helpers kept in plain .ts files.
src/collections/  collection definitions, re-exported from src/server/collections/.
```

`src/server/pipeline.ts` holds `node:crypto` deliberately, so nothing pulling a Node
builtin can reach the client bundle.

### 3.2 Data model

Four collections. Created by `yarn nocobase upgrade`; no migration ships, per the
repo convention for brand-new collections.

**`tenders`** — one row per notice.
`dedupeKey` · `sourceKey` · `sourceName` · `externalId` · `title` · `buyer` ·
`country` · `url` · `description` · `noticeType` · `publishedAt` · `deadlineAt` ·
`clarificationDeadlineAt` · `estimatedValue` · `currency` · `lotCount` ·
`relevanceScore` · `disciplines` · `cpvCodes` · `verdict` · `status` · `bidBrief` ·
`raw` · `crmLeadId` · `crmSyncedAt` · `crmSyncStatus` · `crmError`

**`tenderSources`** — which portals to harvest.
`sourceKey` · `title` · `enabled` · `config` · `lookbackDays` · `limit` ·
`minRelevance` · `lastHarvestAt`

**`tenderHarvestRuns`** — an audit record per source per run.
`sourceKey` · `status` · `startedAt` · `finishedAt` · `fetched` · `created` ·
`updated` · `skipped` · `error`

**`crmTargets`** — where leads go.
`title` · `enabled` · `baseUrl` · `leadPath` · `tokenVariable` · `authHeader` ·
`authScheme` · `idPath` · `fieldMap` · `defaultValues`

Two columns carry the design:

- **`dedupeKey`** (`sourceKey:externalId`, unique index) makes re-harvesting
  idempotent at the database level rather than by application check. Over-long
  identifiers are truncated with a hash suffix so two long URLs sharing a prefix
  cannot collide.
- **`raw`** keeps the untouched source payload, so every notice can be re-parsed
  after a scoring or extraction rule changes, without re-fetching.

### 3.3 Harvest pipeline

```
tenderSources (enabled)
   └─ adapter.fetchNotices({ since, limit, config })   → RawNotice[]
        └─ scoreRelevance()        → score, disciplines, matched + disqualifying terms
        └─ extractFields()         → deadline, value, security, eligibility, evaluation …
        └─ buildBidBrief()         → timeline, commercials, fit, risks, checklist, gaps
             └─ below minRelevance → skipped
             └─ otherwise          → upsert on dedupeKey
   └─ lastHarvestAt advanced (only on success)
   └─ tenderHarvestRuns row written (always)
```

`since` is the last successful run, else `now − lookbackDays`. The window advances
**only after a success**, so a failed source retries its whole window rather than
skipping it. One unreachable portal cannot abort the run: failures are captured per
source into the run log.

On update, `status` is deliberately excluded — a re-harvest must never reset a tender
someone has moved to `bidding`.

### 3.4 Source adapters

Every adapter satisfies one interface (`key`, `label`, `docs`, `requiredConfig?`,
`fetchNotices`) and is registered in `src/server/sources/index.ts`.

| Key                | Portal              | Transport                  | Config                          |
| ------------------ | ------------------- | -------------------------- | ------------------------------- |
| `find-a-tender`    | UK Find a Tender    | OCDS, cursor pagination    | —                               |
| `contracts-finder` | UK Contracts Finder | OCDS, page pagination      | —                               |
| `ted-eu`           | TED (EU)            | v3 search, iteration token | —                               |
| `world-bank`       | World Bank notices  | Data Catalog view          | `endpoint`, `viewId` (optional) |
| `reliefweb`        | ReliefWeb (NGO/UN)  | v2 reports, text query     | `appname`                       |
| `rss`              | Any RSS/Atom feed   | Generic feed               | `url`                           |

The two UK portals share one OCDS normaliser; only the notice URL differs. TED filters
**server-side on creative CPV codes**, so it returns a workable volume rather than
every EU notice.

The generic `rss` adapter exists because UNGM, UNDP and AfDB publish notices but expose
no public JSON API. Adding one of them is a config row rather than a code change.

### 3.5 Scoring and extraction

**Scoring** is a weighted term list across ten creative disciplines. Title matches
count five times body matches; body weight is capped so a long document cannot
out-shout the title. Terms like `civil works` or `furniture supply` subtract — that is
what keeps "detailed **design** of civil works" out of the pipeline. A creative CPV
code is the buyer's own classification, so it sets a floor of 70.

Calibrated bands, against `DEFAULT_MIN_RELEVANCE = 30`:

| Notice                                                      | Score | Outcome  |
| ----------------------------------------------------------- | ----- | -------- |
| `Brand Identity and Visual Identity Design Services`        | 100   | strong   |
| `Framework Agreement for Marketing Services` (CPV 79340000) | 70    | strong   |
| `Consultancy Services`, communications-heavy body           | 50    | possible |
| `Annual Report Production`                                  | 40    | possible |
| `Construction of a Water Supply System`                     | 0     | filtered |

`scoreRelevance` returns `matchedTerms` **and** `disqualifyingTerms`, so any score can
be audited rather than trusted.

**Extraction** reads: submission deadline with its time of day, clarification and
site-visit dates, estimated value, bid security (amount or percentage), bid validity,
contract duration, evaluation weighting with technical pass mark, submission channel,
eligibility conditions, mandatory documents, consortium and site-visit flags, lot count.

Numeric dates are read **day-first**, matching the UK, EU and UN portals targeted here.
Hard-wrapped lines are rejoined before sentence splitting, so requirement sentences are
not cut in half.

### 3.6 The bid brief

Ordered the way a bid decision is actually made: can we still bid → what does it cost
to bid → is it our kind of work → what would disqualify us → what is left to do → and
last, what the notice never said.

The `gaps` array is the load-bearing part. It is the difference between _"no bid bond
is required"_ and _"the notice did not say"_. A blank field otherwise reads as the
first when it means the second.

Milestones already in the past become **risks**, never checklist items — a site visit
held last week is lost eligibility, not a to-do.

### 3.7 CRM hand-off

```
tender ──[Send to CRM]──► buildCrmLead()  → CRM-neutral lead
                            └─ applyFieldMap(fieldMap, defaultValues)
                                 └─ POST {baseUrl}{leadPath}  (token from env by name)
                                      └─ crmLeadId, crmSyncedAt, crmSyncStatus written back
```

On demand only. Idempotent: a tender already carrying a `crmLeadId` reports as
`skipped`, because whoever picked the lead up may have edited it since. `resend: true`
overrides deliberately.

Caller and configuration problems (unknown tender, no enabled target) throw and become
4xx. A failed CRM call is recorded on the tender as `crmSyncStatus` + `crmError`, so it
is visible next to the record it concerns.

### 3.8 UI

Three flow models; everything else is native NocoBase blocks.

- **`BidBriefFieldModel`** — bound to the `json` interface but _not_ as the default, so
  the generic JSON viewer still handles every other JSON field.
- **`HarvestTendersActionModel`** — collection scene. A partially failed harvest is a
  _warning_, not an error: the run still created rows from the sources that worked.
- **`SendTenderToCrmActionModel`** — record scene.

---

## 4. Design decisions

Recorded so they are not silently undone.

| #   | Decision                               | Why                                                                                         |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Rule-based extraction, no LLM          | Deterministic, auditable, no API key, no invented deadlines. Unknowns are reported as gaps. |
| 2   | Structured APIs over HTML scraping     | No HTML-parser dependency; adapters target documented, stable contracts.                    |
| 3   | Title weighted 5× body, body capped    | Stops a long document out-shouting the title, which is where the real subject is.           |
| 4   | CPV sets a score floor                 | It is the buyer's own classification, so it outranks anything inferred from prose.          |
| 5   | Explicit `gaps` array                  | Absence of a value is never a claim that the requirement does not exist.                    |
| 6   | Past milestones → risks                | An expired clarification window is not an action item.                                      |
| 7   | Unique `dedupeKey` index               | Idempotency enforced by the database, not by an application check.                          |
| 8   | `status` excluded from updates         | A re-harvest must not reset a human bid decision.                                           |
| 9   | Window advances only on success        | A failed source retries its whole window instead of skipping notices.                       |
| 10  | Per-source failure isolation           | One unreachable portal must not abort the run.                                              |
| 11  | No scheduler in the plugin             | Workflow already owns cadence, retries and alerting.                                        |
| 12  | Pure logic split from I/O              | Most of the codebase is testable without a DB, network or renderer.                         |
| 13  | CRM token stored **by reference**      | `crmTargets` holds the env-var _name_; a dump of the collection carries no secret.          |
| 14  | CRM-neutral lead + field map           | Another CRM is a config row, not another builder.                                           |
| 15  | Empty values dropped, not sent as null | A stricter CRM will not choke, nor overwrite its own defaults.                              |
| 16  | No TS parameter properties             | Keeps the codebase runnable under Node's strip-only mode, which the test harness uses.      |

---

## 5. HTTP API

| Action                  | Method | Purpose                                                   | Access                    |
| ----------------------- | ------ | --------------------------------------------------------- | ------------------------- |
| `tenderRadar:harvest`   | POST   | Run every enabled source, or those in `sourceKeys`        | `pm.tender-radar.harvest` |
| `tenderRadar:sendToCrm` | POST   | Create a CRM lead from `tenderId`                         | `pm.tender-radar.harvest` |
| `tenderRadar:brief`     | GET    | Stored brief for `tenderId`; `format=markdown` renders it | any signed-in user        |
| `tenderRadar:sources`   | GET    | Adapters this build can harvest                           | any signed-in user        |

Harvest and CRM send sit behind the snippet because both make outbound requests — one
to public portals, one to your CRM with a stored credential.

---

## 6. Configuration

**Sources.** Installing seeds the four adapters needing no credentials, enabled.
`reliefweb` needs an `appname`; `rss` needs a feed `url`.

**CRM target.** One row in `crmTargets`. Defaults target a NocoBase-hosted CRM running
the CRM 2.0 solution (`/api/nb_crm_leads:create`, `Bearer` auth, id at `data.id`).
Every default is per-target config.

**The credential.** `tokenVariable` holds the _name_ of an environment variable. The
token resolves at request time from NocoBase environment variables or `process.env`.
Note the trust boundary: the token is sent to whatever `baseUrl` is configured, so
**who can edit `crmTargets` is who can redirect the credential**. That is gated by the
same ACL snippet as harvesting.

---

## 7. Verification status

Be precise about this, because the gap matters.

| Check                        | Status                                                      | How                                                                |
| ---------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| Unit tests                   | ✅ 188 pass                                                 | Node native TS strip + `node:test`, via a vitest-API shim          |
| Type checking                | ✅ clean under `--strict`                                   | tsc 5.4.5, real React + antd 5.24.2 types, stubs for `@nocobase/*` |
| Formatting                   | ✅ clean                                                    | prettier 3.1.1, matching the repo's resolved version               |
| i18n coverage                | ✅ 126 keys, en-US + zh-CN symmetric, no gaps, no dead keys | scripted diff against keys the source uses                         |
| `yarn test`                  | ❌ not run                                                  | see below                                                          |
| `yarn eslint`                | ❌ not run                                                  | see below                                                          |
| Live portal harvest          | ❌ not run                                                  | all six hosts egress-blocked from the build environment            |
| Live CRM send                | ❌ not run                                                  | `crm.simpauldesign.com` resolves but is egress-blocked             |
| UI rendered in a running app | ❌ not done                                                 | no app instance available                                          |

**Why `yarn test` could not run.** `yarn.lock` pins 3,833 tarballs to
`registry.npmmirror.com`, which the build environment's proxy blocks. Rewriting those
URLs was denied as a registry bypass, which was not worked around. Tests are written to
repo convention (vitest, co-located in `__tests__`) but executed through a shim.

One consequence worth knowing: `src/server/__tests__/sources.test.ts` uses `vi.mock`,
which the shim cannot emulate. Its 21 assertions were verified through an adapted copy
using the same stub. **Run the real suite once on a working install.**

---

## 8. Remaining work

**Phase 0 — environment.** Working `yarn install`. If the CRM 2.0 solution is in play,
note it states NocoBase ≥ 2.1.0-beta.2 with PostgreSQL 16 and `DB_UNDERSCORED` not
`true`; this repo is on 2.0.58.

**Phase 1 — enable.** `yarn pm add` + `yarn pm enable`, then `yarn nocobase upgrade`.
Confirm the four collections and the unique index on `dedupeKey`. Run `yarn test` and
`yarn eslint --fix` on the package.

**Phase 2 — verify sources.** Harvest each source once, on its own. `tenderHarvestRuns`
records the error if a contract has moved. `world-bank` `endpoint`/`viewId` are
overridable for exactly this. Expect at least one adapter to need adjustment.

**Phase 3 — UI.** Build the `tenders` table, switch the Bid brief field's component to
_Bid brief_, add Harvest now to the table toolbar and Send to CRM to the row. Confirm
both render and both report correctly.

**Phase 4 — CRM.** Create the `crmTargets` row, set the token environment variable,
send **one** tender, inspect the created lead, adjust `leadPath` and `fieldMap` to the
real schema.

**Phase 5 — schedule.** Workflow schedule trigger → HTTP request node against
`tenderRadar:harvest`. Add a notification on new strong-fit tenders.

**Phase 6 — tune.** Watch `skipped` counts against what a person would have kept, then
adjust `minRelevance` per source. Add discipline terms the scorer missed.

---

## 9. Risks and open questions

| Risk                                              | Impact                             | Mitigation                                                   |
| ------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------ |
| Adapter contracts unverified against live portals | A source returns nothing or errors | Per-source run log; overridable endpoints; verify in Phase 2 |
| CRM endpoint and schema assumed                   | First send rejected                | Every field is config; send one tender first                 |
| No live UI render                                 | A model fails to mount             | Type-checked against real antd types; verify in Phase 3      |
| Day-first date parsing                            | A US-format feed misreads dates    | Documented; check any `rss` source added from a US publisher |
| Detail only inside an attached PDF                | Requirement missed                 | Reported in `gaps`, never silently blank                     |
| Portal rate limits unknown                        | Throttling on large backfills      | Per-source `limit`; start with a short `lookbackDays`        |

**Open question.** What software runs `crm.simpauldesign.com`? The defaults assume a
NocoBase-hosted CRM 2.0. If it is something else, the field map and `leadPath` handle
most of it, but OAuth-based CRMs (Zoho, HubSpot) would need a token-refresh step the
current client does not have.

---

## 10. File map

```
src/shared/          relevance · extract · dates · summary · crmLead · types
src/server/          harvest · pipeline · plugin · actions/tenderRadar
src/server/sources/  index · ocds · find-a-tender · contracts-finder · ted
                     world-bank · reliefweb · rss · feed · http · json
src/server/crm/      target · client · send
src/client/          BidBriefFieldModel · BidBriefPanel · HarvestTendersActionModel
                     SendTenderToCrmActionModel · briefPresentation · harvestResult
                     sendOutcome · models · index
src/collections/     tenders · tenderSources · tenderHarvestRuns · crmTargets
src/locale/          en-US · zh-CN
```

Tests sit in `__tests__` beside the code they cover: 188 assertions across 14 files.
