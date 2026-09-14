/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import { readHarvestResult } from '../harvestResult';

describe('readHarvestResult', () => {
  it('unwraps the NocoBase response envelope', () => {
    const result = readHarvestResult({
      data: { sources: 4, created: 12, updated: 5, skipped: 40, failed: [] },
    });

    expect(result).toEqual({ sources: 4, created: 12, updated: 5, skipped: 40, failed: [] });
  });

  it('accepts a bare body, in case the envelope is already unwrapped', () => {
    expect(readHarvestResult({ sources: 1, created: 2, updated: 0, skipped: 0, failed: [] }).created).toBe(2);
  });

  it('reads missing counters as zero rather than undefined', () => {
    expect(readHarvestResult({ data: {} })).toEqual({
      sources: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: [],
    });
  });

  it('survives a null, a string or an array payload', () => {
    for (const payload of [null, undefined, 'nonsense', [1, 2, 3]]) {
      expect(readHarvestResult(payload).created).toBe(0);
    }
  });

  it('keeps failure entries that name a source, with the error when present', () => {
    const result = readHarvestResult({
      data: { failed: [{ sourceKey: 'ted-eu', error: 'HTTP 503' }, { sourceKey: 'rss' }] },
    });

    expect(result.failed).toEqual([{ sourceKey: 'ted-eu', error: 'HTTP 503' }, { sourceKey: 'rss' }]);
  });

  it('drops malformed failure entries instead of rendering blanks', () => {
    const result = readHarvestResult({ data: { failed: [null, 'oops', {}, { sourceKey: 'ok' }] } });

    expect(result.failed).toEqual([{ sourceKey: 'ok' }]);
  });

  it('ignores a non-numeric counter', () => {
    expect(readHarvestResult({ data: { created: 'lots' } }).created).toBe(0);
  });
});
