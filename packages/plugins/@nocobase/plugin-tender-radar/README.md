# Tender radar

Harvests creative-agency service tenders from public procurement portals, scores how
well each notice fits agency work, and builds a **bid brief** — the key items to
consider before committing to a bid.

Everything is rule-based and deterministic: no LLM, no API key, no hallucinated
deadlines. A field the extractor cannot establish is reported as a gap rather than
left silently blank.

## What you get

Three collections, usable with NocoBase's own table, form, kanban and filter blocks:

| Collection          | Purpose                                                                               |
| ------------------- | ------------------------------------------------------------------------------------- |
| `tenders`           | One row per notice, with extracted bid fields, a relevance score and the stored brief |
| `tenderSources`     | Which portals to harvest, and their per-source settings                               |
| `tenderHarvestRuns` | An audit record per source per run: counts, duration, error                           |

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

`tenderRadar:harvest` sits behind the `pm.tender-radar.harvest` ACL snippet, because it
makes outbound requests. `tenderRadar:brief` and `tenderRadar:sources` are open to any
signed-in user.

## Tests

```bash
yarn test packages/plugins/@nocobase/plugin-tender-radar
```

Covers relevance scoring and its negative cases, date and money parsing, field
extraction, brief assembly, RSS/Atom parsing, every source normaliser and its
pagination, and the harvest loop's de-duplication, window advancement and
failure isolation.

## Limitations

- Adapters are written against each portal's published API documentation. Verify the
  first live run per source — `tenderHarvestRuns` records the error if a contract has
  moved, and the World Bank `endpoint`/`viewId` are overridable in source config for
  exactly that reason.
- Extraction reads the notice text. Detail that lives only inside an attached PDF is not
  read, so `gaps` will list it.
- Numeric dates are read day-first, matching the UK, EU and UN portals targeted here.
  A US-format feed added via `rss` needs that checked.
- No bespoke UI ships with the plugin; the collections are driven with native NocoBase
  blocks.
