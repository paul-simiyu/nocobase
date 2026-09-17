# Tender radar

Harvests creative-agency service tenders from public procurement portals, scores how
well each notice fits agency work, and builds a **bid brief** — the key items to
consider before committing to a bid.

For the architecture, the design decisions behind it and the rollout plan, see
[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md), also published as a
[shareable page](https://claude.ai/artifact/8hzE1HGyudrmY2RoVw8ppW) for readers who
are not working in the branch. The markdown is the source of truth; the page is a
rendering of it.

Everything is rule-based and deterministic: no LLM, no API key, no hallucinated
deadlines. A field the extractor cannot establish is reported as a gap rather than
left silently blank.

## What you get

Four collections, usable with NocoBase's own table, form, kanban and filter blocks:

| Collection          | Purpose                                                                               |
| ------------------- | ------------------------------------------------------------------------------------- |
| `tenders`           | One row per notice, with extracted bid fields, a relevance score and the stored brief |
| `tenderSources`     | Which portals to harvest, and their per-source settings                               |
| `tenderHarvestRuns` | An audit record per source per run: counts, duration, error                           |
| `crmTargets`        | Where qualified tenders are pushed as CRM leads                                       |

## In the UI

The collections are driven with NocoBase's own blocks. Three pieces those blocks
cannot express ship with the plugin:

**Bid brief panel** — a field model bound to the `json` interface, but _not_ as the
default, so the generic JSON viewer still handles every other JSON field. On a
details or form block, add the **Bid brief** field and switch its field component to
_Bid brief_; the stored brief renders as dates, commercials, risks and a checklist
instead of raw JSON. An empty column, or one holding something that is not a brief,
degrades to a message rather than an error.

**Send to CRM** — a record-scene button on a tender, covered under
[Sending a tender to the CRM](#sending-a-tender-to-the-crm).

**Harvest now** — a collection-scene action button. Drop it into the `tenders` table
toolbar to call `tenderRadar:harvest`, report what was created and updated, then
refresh the block. A source that fails is reported as a warning, not an error: the
run still created rows from the sources that worked, and `tenderHarvestRuns` holds
the detail.

## Sources

| Key                | Portal                                                                                                                               | Config needed                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `find-a-tender`    | [UK Find a Tender](https://www.find-tender.service.gov.uk/apidocumentation/1.0/GET-ocdsReleasePackages) (OCDS)                       | —                                  |
| `contracts-finder` | [UK Contracts Finder](https://www.contractsfinder.service.gov.uk/apidocumentation/Notices/1/GET-Published-Notice-OCDS-Search) (OCDS) | —                                  |
| `ted-eu`           | [TED](https://docs.ted.europa.eu/api/latest/search.html), EU-wide                                                                    | —                                  |
| `world-bank`       | [World Bank procurement notices](https://financesone.worldbank.org/procurement-notices/DS01595)                                      | optional `endpoint`, `viewId`      |
| `reliefweb`        | [ReliefWeb](https://apidoc.reliefweb.int/) — NGO and UN agency RFPs                                                                  | `appname`                          |
| `rss`              | Any RSS/Atom procurement feed                                                                                                        | `url`, optional `buyer`, `country` |

`ted-eu` filters server-side on the CPV codes that cover creative work (advertising,
marketing, graphic design, PR, specialty design, film and video, web design, printed
matter), so it returns a workable volume rather than every EU notice.

### Portals without a machine-readable API

UNGM, UNDP and AfDB publish procurement notices but expose no public JSON API. Where
they offer a feed, add it with the generic `rss` adapter rather than waiting for a
bespoke adapter:

```json
{ "sourceKey": "rss", "title": "UNDP procurement notices", "config": { "url": "https://…/notices.rss" } }
```

## Install

```bash
yarn pm add @nocobase/plugin-tender-radar
yarn pm enable @nocobase/plugin-tender-radar
```

Installing seeds the four sources that need no credentials, enabled and ready.
`reliefweb` and `rss` are left for you to add once you have an `appname` or a feed URL.

Collections and indexes are created by `yarn nocobase upgrade`, so no migration ships
with this plugin.

## Deployment

The platform is served at **`https://proj.simpauldesign.com`**. That host is also
the contact URL the harvester sends to portals in its `User-Agent`, so portal
operators reading their logs can identify who is calling — change
`USER_AGENT` in `src/server/sources/http.ts` if you run this plugin elsewhere.

Relevant NocoBase settings for that deployment:

| Variable        | Value        | Note                                                      |
| --------------- | ------------ | --------------------------------------------------------- |
| `APP_ENV`       | `production` | In production NocoBase does not serve static files itself |
| `APP_PORT`      | `13000`      | The port nginx proxies to                                 |
| `APP_KEY`       | _(secret)_   | Must be set, and must not be the example value            |
| `API_BASE_PATH` | `/api/`      | Prefix every action in this README assumes                |
| `API_BASE_URL`  | empty        | Leave empty when the API is served from the same host     |

Ready-to-use compose, environment and nginx config for that host live in
[`deploy/proj.simpauldesign.com/`](../../../../deploy/proj.simpauldesign.com), along
with the first-deploy steps.

`proj.simpauldesign.com` already resolves, to the same address as
`crm.simpauldesign.com`, and a wildcard certificate for `*.simpauldesign.com` covers it
— a wildcard matches one label, which this host has. Nothing extra is needed for DNS or
TLS.

Note the corollary if a `www.` form is ever added: `www.proj.simpauldesign.com` is four
labels, so the same wildcard would **not** cover it. Serve that as a redirect from the
edge rather than as a second origin, or it needs its own certificate entry.

## Harvesting

```bash
# every enabled source
curl -X POST '<host>/api/tenderRadar:harvest' -H 'Authorization: Bearer <token>'

# just one or two
curl -X POST '<host>/api/tenderRadar:harvest' -H 'Content-Type: application/json' \
  -d '{"sourceKeys":["find-a-tender","ted-eu"]}'
```

The response reports totals plus a per-source breakdown, and every run is written to
`tenderHarvestRuns`.

Each source tracks its own `lastHarvestAt` and asks the portal only for notices since
then, falling back to `lookbackDays` on a first run. The window advances **only after a
successful run**, so a failed source retries its whole window rather than skipping it.
De-duplication is enforced by a unique index on `dedupeKey` (`sourceKey:externalId`), so
re-harvesting updates rows instead of duplicating them — and never resets a `status` a
person has moved to `bidding`.

### On a schedule

The plugin deliberately ships no scheduler. Use **Workflow** with a _Schedule_ trigger
and an _HTTP request_ node pointing at `POST /api/tenderRadar:harvest`. That keeps the
cadence, retries and failure notifications in the place your team already manages them.

## The bid brief

```bash
curl '<host>/api/tenderRadar:brief?tenderId=42'                    # structured JSON
curl '<host>/api/tenderRadar:brief?tenderId=42&format=markdown'    # ready to email
```

A brief pulls together what actually decides a bid:

- **Timeline** — published, clarification close, submission deadline (with time of day),
  days remaining, and an urgency band. Milestones already past become risks, not tasks.
- **Commercials** — estimated value, bid security (amount or percentage), bid validity
  period, contract duration.
- **Fit** — relevance score, the creative disciplines detected, and a verdict.
- **Requirements** — eligibility conditions, mandatory documents, evaluation weighting
  and any technical pass mark.
- **Submission** — channel (portal, email, physical), lot count, consortium and site-visit
  flags.
- **Risks** — short turnaround, bid bond lead time, a pass mark that gates the financial
  envelope, a mandatory site visit already held, off-scope terms in the notice.
- **Checklist** — the actions still open, ordered by what blocks a submission first.
- **Not found in the notice** — every field the rules could not establish.

That last section matters: it is the difference between "no bid bond is required" and
"the notice did not say". Only the tender document settles the second.

## Sending a tender to the CRM

A tender that is worth bidding becomes a **lead** in your CRM, on demand — there is
no auto-push, so a noisy portal day cannot flood the pipeline. Use the **Send to
CRM** button on a tender record, or call the action directly:

```bash
curl -X POST '<host>/api/tenderRadar:sendToCrm' -H 'Content-Type: application/json' \
  -d '{"tenderId": 42}'
```

The tender keeps `crmLeadId`, `crmSyncedAt`, `crmSyncStatus` and `crmError`, so the
link and any failure are visible next to the record they concern.

**Sending is idempotent.** A tender already carrying a `crmLeadId` is reported as
`skipped`, never duplicated — the lead may since have been edited by whoever picked
it up, and replacing it with a fresh copy would discard that work. Pass
`{"resend": true}` to override deliberately.

### Configuring a target

Add one row to `crmTargets`:

| Field                       | Purpose                                                    | Default                    |
| --------------------------- | ---------------------------------------------------------- | -------------------------- |
| `baseUrl`                   | Root of the CRM                                            | —                          |
| `leadPath`                  | Path that creates a lead                                   | `/api/nb_crm_leads:create` |
| `tokenVariable`             | **Name** of the environment variable holding the API token | —                          |
| `authHeader` / `authScheme` | How the token is sent                                      | `Authorization` / `Bearer` |
| `idPath`                    | Dot path to the new id in the response                     | `data.id`                  |
| `fieldMap`                  | Canonical lead key → your CRM's column name                | built-in default           |
| `defaultValues`             | Sent with every lead (owner, stage, …)                     | `{}`                       |

**The credential is stored by reference, never by value.** `tokenVariable` holds the
_name_ of an environment variable; the token itself is resolved at request time from
NocoBase environment variables or `process.env`. A dump of this collection therefore
carries no secret, and the token never appears in a lead payload.

The defaults target a NocoBase-hosted CRM running the
[CRM 2.0 solution](https://docs.nocobase.com/solution/crm), whose leads live in
`nb_crm_leads`. Every one of them is per-target config, so a different CRM needs a
row rather than a code change.

### What a lead carries

The tender is mapped onto a CRM-neutral lead, then renamed by `fieldMap` on the way
out — so adding a CRM means adding a mapping, not another builder:

`title`, `organisation` (the buying authority), `country`, `source`, `sourceUrl`,
`description` (a plain-text summary leading with deadline and value), `brief` (the
full markdown brief, for a rich-text field), `estimatedValue`, `currency`,
`expectedCloseDate` (the submission deadline — what the CRM forecasts on),
`relevanceScore`, `disciplines`, and `externalRef` (the tender's dedupe key, so the
CRM can de-duplicate independently of this plugin).

Unmapped and empty values are dropped rather than sent as null, so a CRM that rejects
unknown columns — or overwrites its own defaults with null — is not upset by a field
this particular tender happened not to have.

## Relevance scoring

A weighted term list across ten creative disciplines, with title matches weighted five
times body matches and body weight capped so a long document cannot out-shout the title.
Terms like `civil works`, `borehole` or `furniture supply` subtract, which is what keeps
"detailed **design** of civil works" out of the pipeline. A creative CPV code is the
buyer's own classification, so it sets a floor of 70 regardless of the prose.

The bands, against the default minimum relevance of 30:

| Notice                                                      | Score | Outcome      |
| ----------------------------------------------------------- | ----- | ------------ |
| `Brand Identity and Visual Identity Design Services`        | 100   | strong       |
| `Framework Agreement for Marketing Services` (CPV 79340000) | 70    | strong       |
| `Consultancy Services` with a communications-heavy body     | 50    | possible     |
| `Annual Report Production`                                  | 40    | possible     |
| `Construction of a Water Supply System`                     | 0     | filtered out |

`scoreRelevance` returns `matchedTerms` and `disqualifyingTerms`, so any score can be
audited instead of trusted. Raise or lower the bar per source with `minRelevance`.

## Permissions

`tenderRadar:harvest` and `tenderRadar:sendToCrm` sit behind the
`pm.tender-radar.harvest` ACL snippet, because both make outbound requests — one to
public portals, one to your CRM with a stored credential. `tenderRadar:brief` and
`tenderRadar:sources` are open to any signed-in user.

## Tests

```bash
yarn test packages/plugins/@nocobase/plugin-tender-radar
```

Covers relevance scoring and its negative cases, date and money parsing, field
extraction, brief assembly, RSS/Atom parsing, every source normaliser and its
pagination, the harvest loop's de-duplication, window advancement and failure
isolation, the CRM lead mapping and field map, target and credential resolution,
the send path's idempotency and failure recording, and on the client side the
harvest and send response parsers plus the badge colour and label maps - including
that every verdict, urgency band and discipline the scorer can emit has a label.

## Limitations

- Adapters are written against each portal's published API documentation. Verify the
  first live run per source — `tenderHarvestRuns` records the error if a contract has
  moved, and the World Bank `endpoint`/`viewId` are overridable in source config for
  exactly that reason.
- Extraction reads the notice text. Detail that lives only inside an attached PDF is not
  read, so `gaps` will list it.
- Numeric dates are read day-first, matching the UK, EU and UN portals targeted here.
  A US-format feed added via `rss` needs that checked.
- The CRM defaults assume a NocoBase-hosted CRM. They were written from the CRM 2.0
  schema, not verified against a live instance, so confirm the first send and adjust
  `leadPath` and `fieldMap` if your lead table differs.
- The UI is three flow models plus native NocoBase blocks. The brief panel and the
  harvest button are type-checked and their pure logic is unit tested, but they have
  not been rendered in a running app - exercise both once after enabling the plugin.
