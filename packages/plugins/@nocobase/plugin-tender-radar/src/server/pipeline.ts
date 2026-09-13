/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { createHash } from 'node:crypto';
import { extractFields } from '../shared/extract';
import { scoreRelevance } from '../shared/relevance';
import { buildBidBrief } from '../shared/summary';
import type { BidBrief, CreativeDiscipline, JsonObject, RawNotice } from '../shared/types';

/** Columns the harvester writes to the `tenders` collection. */
export interface TenderRecordValues {
  dedupeKey: string;
  sourceKey: string;
  sourceName: string;
  externalId: string;
  title: string;
  buyer?: string;
  country?: string;
  url: string;
  description: string;
  noticeType?: string;
  publishedAt?: string;
  deadlineAt?: string;
  clarificationDeadlineAt?: string;
  estimatedValue?: number;
  currency?: string;
  lotCount?: number;
  relevanceScore: number;
  disciplines: CreativeDiscipline[];
  cpvCodes: string[];
  verdict: BidBrief['fit']['verdict'];
  bidBrief: BidBrief;
  raw: JsonObject;
}

/**
 * Builds the de-duplication key for a notice.
 *
 * Long identifiers (ReliefWeb uses URLs) are truncated with a hash suffix so the
 * key stays inside a standard unique-index length without risking a collision
 * between two notices that share a prefix.
 */
export function buildDedupeKey(sourceKey: string, externalId: string): string {
  const key = `${sourceKey}:${externalId}`;
  if (key.length <= 200) return key;
  const digest = createHash('sha1').update(key).digest('hex').slice(0, 16);
  return `${key.slice(0, 160)}:${digest}`;
}

export interface BuildRecordOptions {
  notice: RawNotice;
  /** Adapter key the notice came from; part of the de-duplication key. */
  sourceKey: string;
  sourceLabel: string;
  /** Injected so a whole harvest shares one clock, and tests are reproducible. */
  now?: Date;
}

/**
 * Scores a notice, extracts its bid-critical fields and assembles the brief.
 *
 * Pure by design: the harvester handles persistence, so this can be re-run over
 * stored `raw` payloads after a scoring or extraction rule changes.
 */
export function buildTenderRecord({ notice, sourceKey, sourceLabel, now }: BuildRecordOptions): TenderRecordValues {
  const relevance = scoreRelevance({
    title: notice.title,
    description: notice.description,
    cpvCodes: notice.cpvCodes,
  });

  const fields = extractFields({
    title: notice.title,
    description: notice.description,
    deadlineAt: notice.deadlineAt,
    clarificationDeadlineAt: notice.clarificationDeadlineAt,
    estimatedValue: notice.estimatedValue,
    currency: notice.currency,
    lotCount: notice.lotCount,
  });

  const brief = buildBidBrief({
    title: notice.title,
    buyer: notice.buyer,
    country: notice.country,
    url: notice.url,
    sourceLabel,
    publishedAt: notice.publishedAt,
    relevance,
    fields,
    now,
  });

  return {
    dedupeKey: buildDedupeKey(sourceKey, notice.externalId),
    sourceKey,
    sourceName: sourceLabel,
    externalId: notice.externalId,
    title: notice.title,
    buyer: notice.buyer,
    country: notice.country,
    url: notice.url,
    description: notice.description,
    noticeType: notice.noticeType,
    publishedAt: notice.publishedAt,
    deadlineAt: fields.deadlineAt,
    clarificationDeadlineAt: fields.clarificationDeadlineAt,
    estimatedValue: fields.estimatedValue?.value,
    currency: fields.estimatedValue?.currency ?? notice.currency,
    lotCount: fields.lotCount,
    relevanceScore: relevance.score,
    disciplines: relevance.disciplines,
    cpvCodes: notice.cpvCodes ?? [],
    verdict: brief.fit.verdict,
    bidBrief: brief,
    raw: notice.raw,
  };
}
