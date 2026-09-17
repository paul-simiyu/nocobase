/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Repository } from '@nocobase/database';
import { describe, expect, it } from 'vitest';
import type { RawNotice, SourceAdapter } from '../../shared/types';
import { harvestAll, harvestSource, resolveSince, type TenderSourceRow } from '../harvest';

const NOW = new Date('2026-03-20T00:00:00.000Z');

type Row = Record<string, unknown> & { id: number };

/** A minimal stand-in for the slice of Repository the harvester uses. */
function makeRepo(seed: Row[] = []) {
  const rows = [...seed];
  let sequence = rows.length;
  const wrap = (row: Row) => ({ toJSON: () => ({ ...row }), get: (key: string) => row[key] });

  const repo = {
    rows,
    async find({ filter }: { filter?: Record<string, unknown> } = {}) {
      return rows
        .filter(
          (row) =>
            !filter ||
            Object.entries(filter).every(([key, value]) => {
              if (value !== null && typeof value === 'object' && '$in' in value) {
                return (value as { $in: unknown[] }).$in.includes(row[key]);
              }
              return row[key] === value;
            }),
        )
        .map(wrap);
    },
    async findOne({ filter, filterByTk }: { filter?: Record<string, unknown>; filterByTk?: unknown } = {}) {
      const hit =
        filterByTk !== undefined
          ? rows.find((row) => String(row.id) === String(filterByTk))
          : rows.find((row) => Object.entries(filter ?? {}).every(([key, value]) => row[key] === value));
      return hit ? wrap(hit) : null;
    },
    async create({ values }: { values: Record<string, unknown> }) {
      const row = { ...values, id: ++sequence } as Row;
      rows.push(row);
      return wrap(row);
    },
    async update({ filterByTk, values }: { filterByTk: unknown; values: Record<string, unknown> }) {
      const row = rows.find((candidate) => String(candidate.id) === String(filterByTk));
      if (row) Object.assign(row, values);
      return [1];
    },
  };

  return repo;
}

const asRepository = (repo: ReturnType<typeof makeRepo>) => repo as unknown as Repository;

const creative: RawNotice = {
  externalId: 'N-1',
  title: 'Provision of Brand Identity Design Services',
  description: 'Closing date: 3 April 2026. A bid security of GBP 5,000 is required.',
  url: 'https://example.org/notice/1',
  raw: {},
};

const furniture: RawNotice = {
  externalId: 'N-2',
  title: 'Supply and Delivery of Office Furniture',
  description: 'Furniture supply for regional offices.',
  url: 'https://example.org/notice/2',
  raw: {},
};

const stubAdapter = (notices: RawNotice[], onCall?: (since: string) => void): SourceAdapter => ({
  key: 'stub',
  label: 'Stub source',
  docs: 'https://example.org/docs',
  async fetchNotices({ since }) {
    onCall?.(since);
    return notices;
  },
});

const failingAdapter: SourceAdapter = {
  key: 'stub',
  label: 'Stub source',
  docs: 'https://example.org/docs',
  async fetchNotices() {
    throw new Error('portal unreachable');
  },
};

const sourceRow = (overrides: Partial<TenderSourceRow> = {}): TenderSourceRow => ({
  id: 1,
  sourceKey: 'stub',
  enabled: true,
  lookbackDays: 30,
  limit: 100,
  ...overrides,
});

const deps = (adapter: SourceAdapter, sources: Row[] = [{ ...sourceRow(), id: 1, enabled: true } as Row]) => {
  const tenders = makeRepo();
  const sourceRepo = makeRepo(sources);
  const runs = makeRepo();
  return {
    tenders,
    sourceRepo,
    runs,
    harvestDeps: {
      tenders: asRepository(tenders),
      sources: asRepository(sourceRepo),
      runs: asRepository(runs),
      now: NOW,
      resolveAdapter: () => adapter,
    },
  };
};

describe('resolveSince', () => {
  it('uses the last harvest timestamp when there is one', () => {
    expect(resolveSince(sourceRow({ lastHarvestAt: '2026-03-01T00:00:00.000Z' }), NOW)).toBe(
      '2026-03-01T00:00:00.000Z',
    );
  });

  it('falls back to the configured lookback window', () => {
    expect(resolveSince(sourceRow({ lookbackDays: 10 }), NOW)).toBe('2026-03-10T00:00:00.000Z');
  });

  it('defaults to 30 days when the lookback is missing or nonsensical', () => {
    expect(resolveSince(sourceRow({ lookbackDays: 0 }), NOW)).toBe('2026-02-18T00:00:00.000Z');
    expect(resolveSince(sourceRow({ lookbackDays: null }), NOW)).toBe('2026-02-18T00:00:00.000Z');
  });

  it('ignores an unparseable timestamp rather than producing an invalid window', () => {
    expect(resolveSince(sourceRow({ lastHarvestAt: 'nonsense', lookbackDays: 10 }), NOW)).toBe(
      '2026-03-10T00:00:00.000Z',
    );
  });
});

describe('harvestSource', () => {
  it('stores relevant notices and skips the ones below the threshold', async () => {
    const { tenders, harvestDeps } = deps(stubAdapter([creative, furniture]));

    const summary = await harvestSource(harvestDeps, sourceRow());

    expect(summary).toMatchObject({ status: 'succeeded', fetched: 2, created: 1, updated: 0, skipped: 1 });
    expect(tenders.rows).toHaveLength(1);
    expect(tenders.rows[0].dedupeKey).toBe('stub:N-1');
  });

  it('honours a per-source relevance threshold', async () => {
    const { tenders, harvestDeps } = deps(stubAdapter([creative]));

    await harvestSource(harvestDeps, sourceRow({ minRelevance: 101 }));

    expect(tenders.rows).toHaveLength(0);
  });

  it('updates an existing notice instead of duplicating it', async () => {
    const { tenders, harvestDeps } = deps(stubAdapter([creative]));

    await harvestSource(harvestDeps, sourceRow());
    const second = await harvestSource(harvestDeps, sourceRow());

    expect(second).toMatchObject({ created: 0, updated: 1 });
    expect(tenders.rows).toHaveLength(1);
  });

  it('never overwrites a bid status a person has set', async () => {
    const { tenders, harvestDeps } = deps(stubAdapter([creative]));

    await harvestSource(harvestDeps, sourceRow());
    tenders.rows[0].status = 'bidding';
    await harvestSource(harvestDeps, sourceRow());

    expect(tenders.rows[0].status).toBe('bidding');
  });

  it('advances the source window after a successful run', async () => {
    const { sourceRepo, harvestDeps } = deps(stubAdapter([creative]));

    await harvestSource(harvestDeps, sourceRow());

    expect(sourceRepo.rows[0].lastHarvestAt).toEqual(NOW);
  });

  it('records a failure without throwing, and leaves the window untouched for a retry', async () => {
    const { sourceRepo, runs, harvestDeps } = deps(failingAdapter);

    const summary = await harvestSource(harvestDeps, sourceRow());

    expect(summary.status).toBe('failed');
    expect(summary.error).toContain('portal unreachable');
    expect(sourceRepo.rows[0].lastHarvestAt).toBeUndefined();
    expect(runs.rows[0]).toMatchObject({ status: 'failed' });
  });

  it('fails cleanly when the source key has no adapter', async () => {
    const { harvestDeps } = deps(stubAdapter([]));
    const summary = await harvestSource(
      { ...harvestDeps, resolveAdapter: () => undefined },
      sourceRow({ sourceKey: 'ghost' }),
    );

    expect(summary.status).toBe('failed');
    expect(summary.error).toContain('No adapter registered');
  });

  it('logs one run record per invocation', async () => {
    const { runs, harvestDeps } = deps(stubAdapter([creative]));

    await harvestSource(harvestDeps, sourceRow());

    expect(runs.rows).toHaveLength(1);
    expect(runs.rows[0]).toMatchObject({ sourceKey: 'stub', status: 'succeeded', fetched: 1, created: 1 });
  });

  it('passes the resolved window to the adapter', async () => {
    let seen: string | undefined;
    const { harvestDeps } = deps(
      stubAdapter([], (since) => {
        seen = since;
      }),
    );

    await harvestSource(harvestDeps, sourceRow({ lookbackDays: 10 }));

    expect(seen).toBe('2026-03-10T00:00:00.000Z');
  });
});

describe('harvestAll', () => {
  it('runs only enabled sources', async () => {
    const { harvestDeps } = deps(stubAdapter([creative]), [
      { id: 1, sourceKey: 'stub', enabled: true, limit: 10, lookbackDays: 30 } as Row,
      { id: 2, sourceKey: 'stub', enabled: false, limit: 10, lookbackDays: 30 } as Row,
    ]);

    expect(await harvestAll(harvestDeps)).toHaveLength(1);
  });

  it('can be narrowed to named sources', async () => {
    const { harvestDeps } = deps(stubAdapter([creative]), [
      { id: 1, sourceKey: 'stub', enabled: true, limit: 10, lookbackDays: 30 } as Row,
      { id: 2, sourceKey: 'other', enabled: true, limit: 10, lookbackDays: 30 } as Row,
    ]);

    const summaries = await harvestAll(harvestDeps, ['other']);

    expect(summaries).toHaveLength(1);
    expect(summaries[0].sourceKey).toBe('other');
  });

  it('keeps going after one source fails', async () => {
    const flaky: SourceAdapter = {
      key: 'stub',
      label: 'Stub',
      docs: 'https://example.org',
      async fetchNotices({ config }) {
        if (config?.fail) throw new Error('boom');
        return [creative];
      },
    };
    const { harvestDeps } = deps(flaky, [
      { id: 1, sourceKey: 'stub', enabled: true, limit: 10, lookbackDays: 30, config: { fail: 'yes' } } as Row,
      { id: 2, sourceKey: 'stub', enabled: true, limit: 10, lookbackDays: 30 } as Row,
    ]);

    const summaries = await harvestAll(harvestDeps);

    expect(summaries.map((s) => s.status)).toEqual(['failed', 'succeeded']);
  });
});
