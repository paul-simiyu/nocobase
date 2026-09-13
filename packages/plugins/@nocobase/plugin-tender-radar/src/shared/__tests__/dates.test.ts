/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import { daysBetween, findDateNear, findDates } from '../dates';

describe('findDates', () => {
  it('reads ISO, day-first, and month-first formats', () => {
    expect(findDates('2026-04-03')[0].iso).toBe('2026-04-03T00:00:00.000Z');
    expect(findDates('3rd April 2026')[0].iso).toBe('2026-04-03T00:00:00.000Z');
    expect(findDates('April 3, 2026')[0].iso).toBe('2026-04-03T00:00:00.000Z');
    expect(findDates('3 of April 2026')[0].iso).toBe('2026-04-03T00:00:00.000Z');
  });

  it('reads numeric dates day-first', () => {
    expect(findDates('03/04/2026')[0].iso).toBe('2026-04-03T00:00:00.000Z');
  });

  it('falls back to month-first when the second component cannot be a month', () => {
    expect(findDates('04/23/2026')[0].iso).toBe('2026-04-23T00:00:00.000Z');
  });

  it('captures a trailing time of day so the deadline is not moved to midnight', () => {
    expect(findDates('3 April 2026 at 14:30 hrs')[0].iso).toBe('2026-04-03T14:30:00.000Z');
    expect(findDates('3 April 2026 at 2.00 pm')[0].iso).toBe('2026-04-03T14:00:00.000Z');
    expect(findDates('3 April 2026 12:00 am')[0].iso).toBe('2026-04-03T00:00:00.000Z');
  });

  it('rejects impossible calendar dates instead of rolling them over', () => {
    expect(findDates('31 February 2026')).toEqual([]);
    expect(findDates('2026-02-31')).toEqual([]);
  });

  it('rejects years outside a plausible procurement range', () => {
    expect(findDates('3 April 1802')).toEqual([]);
  });

  it('returns matches in document order', () => {
    const dates = findDates('First 1 March 2026 then 2 March 2026.');

    expect(dates.map((d) => d.iso)).toEqual(['2026-03-01T00:00:00.000Z', '2026-03-02T00:00:00.000Z']);
  });
});

describe('findDateNear', () => {
  const notice = 'Published 1 March 2026. Closing date: 3rd April 2026 at 14:30 hrs. Clarifications by 20/03/2026.';

  it('picks the date that follows the cue, not the first date in the text', () => {
    expect(findDateNear(notice, ['closing date'])).toBe('2026-04-03T14:30:00.000Z');
    expect(findDateNear(notice, ['clarification'])).toBe('2026-03-20T00:00:00.000Z');
  });

  it('ignores dates that appear before the cue', () => {
    expect(
      findDateNear('3 April 2026 was the publication. Closing date is unstated.', ['closing date']),
    ).toBeUndefined();
  });

  it('respects the search window', () => {
    const padded = `Closing date ${'x'.repeat(400)} 3 April 2026`;

    expect(findDateNear(padded, ['closing date'])).toBeUndefined();
  });

  it('returns undefined when no cue matches', () => {
    expect(findDateNear(notice, ['site visit'])).toBeUndefined();
  });
});

describe('daysBetween', () => {
  it('counts whole days and goes negative once passed', () => {
    expect(daysBetween(new Date('2026-03-01T00:00:00Z'), new Date('2026-03-11T00:00:00Z'))).toBe(10);
    expect(daysBetween(new Date('2026-03-11T00:00:00Z'), new Date('2026-03-01T00:00:00Z'))).toBe(-10);
  });
});
