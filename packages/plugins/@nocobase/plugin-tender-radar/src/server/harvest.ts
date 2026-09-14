/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Repository } from '@nocobase/database';
import { DEFAULT_MIN_RELEVANCE } from '../constants';
import type { SourceAdapter } from '../shared/types';
import { buildTenderRecord, type TenderRecordValues } from './pipeline';
import { getAdapter } from './sources';

const DAY_MS = 86_400_000;

/** A configured source, as stored in the `tenderSources` collection. */
export interface TenderSourceRow {
  id: number | string;
  sourceKey: string;
  title?: string;
  config?: Record<string, string> | null;
  lookbackDays?: number | null;
  limit?: number | null;
  minRelevance?: number | null;
  lastHarvestAt?: Date | string | null;
}

export interface HarvestSummary {
  sourceKey: string;
  status: 'succeeded' | 'failed';
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  error?: string;
}

export interface HarvestDeps {
  tenders: Repository;
  sources: Repository;
  runs: Repository;
  logger?: { info(message: string, meta?: unknown): void; error(message: string, meta?: unknown): void };
  /** One clock for the whole run, so every brief in it agrees on "today". */
  now?: Date;
  /**
   * Resolves a source key to an adapter. Defaults to the built-in registry;
   * tests pass a stand-in so the harvester can be exercised without network I/O.
   */
  resolveAdapter?: (key: string) => SourceAdapter | undefined;
}

/**
 * Columns that belong to the notice rather than to the bid team.
 *
 * `status` is deliberately absent: a re-harvest must not reset a tender someone
 * has already moved to "bidding".
 */
const updatableColumns = (values: TenderRecordValues): Omit<TenderRecordValues, 'dedupeKey'> => {
  const { dedupeKey: _dedupeKey, ...rest } = values;
  return rest;
};

/** Resolves the window start: the last successful run, else the configured lookback. */
export function resolveSince(row: TenderSourceRow, now: Date): string {
  if (row.lastHarvestAt) {
    const last = new Date(row.lastHarvestAt);
    if (!Number.isNaN(last.getTime())) return last.toISOString();
  }
  const days = row.lookbackDays && row.lookbackDays > 0 ? row.lookbackDays : 30;
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

async function persist(deps: HarvestDeps, values: TenderRecordValues): Promise<'created' | 'updated'> {
  const existing = await deps.tenders.findOne({ filter: { dedupeKey: values.dedupeKey } });
  if (existing) {
    await deps.tenders.update({ filterByTk: existing.get('id') as number, values: updatableColumns(values) });
    return 'updated';
  }
  await deps.tenders.create({ values });
  return 'created';
}

/**
 * Harvests one configured source.
 *
 * Failures are captured into the returned summary and the run log rather than
 * thrown, so one unreachable portal cannot abort the rest of the harvest.
 */
export async function harvestSource(deps: HarvestDeps, row: TenderSourceRow): Promise<HarvestSummary> {
  const now = deps.now ?? new Date();
  const startedAt = new Date();
  const summary: HarvestSummary = {
    sourceKey: row.sourceKey,
    status: 'succeeded',
    fetched: 0,
    created: 0,
    updated: 0,
    skipped: 0,
  };

  try {
    const adapter = (deps.resolveAdapter ?? getAdapter)(row.sourceKey);
    if (!adapter) {
      throw new Error(`No adapter registered for source "${row.sourceKey}".`);
    }

    const minRelevance = row.minRelevance ?? DEFAULT_MIN_RELEVANCE;
    const notices = await adapter.fetchNotices({
      since: resolveSince(row, now),
      limit: row.limit && row.limit > 0 ? row.limit : 200,
      config: row.config ?? undefined,
    });
    summary.fetched = notices.length;

    for (const notice of notices) {
      const values = buildTenderRecord({
        notice,
        sourceKey: adapter.key,
        sourceLabel: row.title || adapter.label,
        now,
      });

      if (values.relevanceScore < minRelevance) {
        summary.skipped += 1;
        continue;
      }

      const outcome = await persist(deps, values);
      summary[outcome] += 1;
    }

    // Advance the window only on success, so a failed run is retried in full.
    await deps.sources.update({ filterByTk: row.id, values: { lastHarvestAt: now } });
  } catch (error) {
    summary.status = 'failed';
    summary.error = error instanceof Error ? error.message : String(error);
    deps.logger?.error(`tender-radar: harvest of "${row.sourceKey}" failed`, { error: summary.error });
  }

  await deps.runs.create({
    values: {
      sourceKey: row.sourceKey,
      status: summary.status,
      startedAt,
      finishedAt: new Date(),
      fetched: summary.fetched,
      created: summary.created,
      updated: summary.updated,
      skipped: summary.skipped,
      error: summary.error ?? null,
    },
  });

  return summary;
}

/** Harvests every enabled source, or only those named in `sourceKeys`. */
export async function harvestAll(deps: HarvestDeps, sourceKeys?: string[]): Promise<HarvestSummary[]> {
  const filter: Record<string, unknown> = { enabled: true };
  if (sourceKeys?.length) {
    filter.sourceKey = { $in: sourceKeys };
  }

  const rows = await deps.sources.find({ filter });
  const summaries: HarvestSummary[] = [];

  for (const row of rows) {
    summaries.push(await harvestSource(deps, row.toJSON() as TenderSourceRow));
  }

  deps.logger?.info('tender-radar: harvest complete', {
    sources: summaries.length,
    created: summaries.reduce((total, s) => total + s.created, 0),
  });

  return summaries;
}
