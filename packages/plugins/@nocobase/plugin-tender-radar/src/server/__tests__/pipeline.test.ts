/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import type { RawNotice } from '../../shared/types';
import { buildDedupeKey, buildTenderRecord } from '../pipeline';

const NOW = new Date('2026-03-01T00:00:00.000Z');

const notice = (overrides: Partial<RawNotice> = {}): RawNotice => ({
  externalId: 'N-1',
  title: 'Provision of Brand Identity Design Services',
  description: 'Closing date: 3 April 2026. The estimated contract value is GBP 250,000.',
  url: 'https://example.org/notice/1',
  raw: { id: 'N-1' },
  ...overrides,
});

describe('buildDedupeKey', () => {
  it('joins the source key and the notice reference', () => {
    expect(buildDedupeKey('find-a-tender', 'ocds-a-1')).toBe('find-a-tender:ocds-a-1');
  });

  it('hashes over-long identifiers instead of truncating them into a collision', () => {
    const a = buildDedupeKey('rss', `https://example.org/${'a'.repeat(300)}?v=1`);
    const b = buildDedupeKey('rss', `https://example.org/${'a'.repeat(300)}?v=2`);

    expect(a.length).toBeLessThanOrEqual(200);
    expect(b.length).toBeLessThanOrEqual(200);
    expect(a).not.toBe(b);
  });

  it('is stable for the same input', () => {
    expect(buildDedupeKey('rss', 'x')).toBe(buildDedupeKey('rss', 'x'));
  });
});

describe('buildTenderRecord', () => {
  it('scores, extracts and briefs a notice in one pass', () => {
    const record = buildTenderRecord({
      notice: notice(),
      sourceKey: 'find-a-tender',
      sourceLabel: 'Find a Tender (UK)',
      now: NOW,
    });

    expect(record.dedupeKey).toBe('find-a-tender:N-1');
    expect(record.sourceKey).toBe('find-a-tender');
    expect(record.sourceName).toBe('Find a Tender (UK)');
    expect(record.relevanceScore).toBeGreaterThanOrEqual(70);
    expect(record.verdict).toBe('strong');
    expect(record.disciplines).toContain('branding');
    expect(record.deadlineAt).toBe('2026-04-03T00:00:00.000Z');
    expect(record.estimatedValue).toBe(250000);
    expect(record.currency).toBe('GBP');
  });

  it('prefers the structured deadline the source published', () => {
    const record = buildTenderRecord({
      notice: notice({ deadlineAt: '2026-05-01T09:00:00.000Z' }),
      sourceKey: 'ted-eu',
      sourceLabel: 'TED (EU)',
      now: NOW,
    });

    expect(record.deadlineAt).toBe('2026-05-01T09:00:00.000Z');
  });

  it('carries the brief and the untouched payload through', () => {
    const record = buildTenderRecord({ notice: notice(), sourceKey: 'rss', sourceLabel: 'Feed', now: NOW });

    expect(record.bidBrief.headline.title).toBe('Provision of Brand Identity Design Services');
    expect(record.bidBrief.timeline.daysRemaining).toBe(33);
    expect(record.raw).toEqual({ id: 'N-1' });
  });

  it('still produces a record for an off-target notice, scored low', () => {
    const record = buildTenderRecord({
      notice: notice({ title: 'Supply and Delivery of Office Furniture', description: 'Furniture supply.' }),
      sourceKey: 'rss',
      sourceLabel: 'Feed',
      now: NOW,
    });

    expect(record.relevanceScore).toBe(0);
    expect(record.verdict).toBe('weak');
  });
});
