/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Context, Next } from '@nocobase/actions';
import { HARVEST_RUNS_COLLECTION, TENDERS_COLLECTION, TENDER_SOURCES_COLLECTION } from '../../constants';
import { briefToMarkdown } from '../../shared/summary';
import type { BidBrief } from '../../shared/types';
import { harvestAll } from '../harvest';
import { SOURCE_ADAPTERS } from '../sources';

const readStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === 'string');
  return items.length ? items : undefined;
};

/**
 * A stored brief is a JSON column, so it arrives as `unknown`. Checking the shape
 * keeps a hand-edited or pre-upgrade row from crashing the renderer.
 */
const isBidBrief = (value: unknown): value is BidBrief => {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return ['headline', 'timeline', 'commercials', 'fit', 'requirements', 'submission'].every(
    (key) => typeof record[key] === 'object' && record[key] !== null,
  );
};

/** POST /api/tenderRadar:harvest - runs every enabled source, or the ones named. */
export async function harvest(ctx: Context, next: Next) {
  const values = ctx.action.params.values as Record<string, unknown> | undefined;
  const sourceKeys = readStringArray(values?.sourceKeys);

  const summaries = await harvestAll(
    {
      tenders: ctx.db.getRepository(TENDERS_COLLECTION),
      sources: ctx.db.getRepository(TENDER_SOURCES_COLLECTION),
      runs: ctx.db.getRepository(HARVEST_RUNS_COLLECTION),
      logger: ctx.app.logger,
    },
    sourceKeys,
  );

  ctx.body = {
    sources: summaries.length,
    created: summaries.reduce((total, s) => total + s.created, 0),
    updated: summaries.reduce((total, s) => total + s.updated, 0),
    skipped: summaries.reduce((total, s) => total + s.skipped, 0),
    failed: summaries.filter((s) => s.status === 'failed').map((s) => ({ sourceKey: s.sourceKey, error: s.error })),
    summaries,
  };

  await next();
}

/**
 * GET /api/tenderRadar:brief?tenderId=1&format=markdown
 *
 * Returns the stored brief, optionally rendered as markdown for an email or a
 * workflow notification body.
 */
export async function brief(ctx: Context, next: Next) {
  const params = ctx.action.params as Record<string, unknown>;
  const tenderId = params.tenderId ?? params.filterByTk;
  if (tenderId === undefined || tenderId === null || tenderId === '') {
    ctx.throw(400, ctx.t('A tenderId is required.'));
  }

  const record = await ctx.db.getRepository(TENDERS_COLLECTION).findOne({ filterByTk: tenderId as string });
  if (!record) {
    ctx.throw(404, ctx.t('Tender not found.'));
  }

  const stored = record.get('bidBrief');
  if (!isBidBrief(stored)) {
    ctx.throw(409, ctx.t('This tender has no bid brief yet. Re-run a harvest to rebuild it.'));
  }

  ctx.body = params.format === 'markdown' ? { markdown: briefToMarkdown(stored) } : stored;

  await next();
}

/** GET /api/tenderRadar:sources - the adapters this build can harvest. */
export async function sources(ctx: Context, next: Next) {
  ctx.body = SOURCE_ADAPTERS.map((adapter) => ({
    key: adapter.key,
    label: adapter.label,
    docs: adapter.docs,
    requiredConfig: adapter.requiredConfig ?? [],
  }));
  await next();
}
