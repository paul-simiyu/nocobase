/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const MONTH_PATTERN = Object.keys(MONTHS).join('|');

export interface DateCandidate {
  /** Character offset of the match within the searched text. */
  index: number;
  /** UTC ISO-8601 timestamp. */
  iso: string;
}

const isPlausible = (year: number, month: number, day: number): boolean => {
  if (year < 2000 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  // Reject e.g. 31 February, which would otherwise roll over into March.
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
};

const toIso = (year: number, month: number, day: number, hour = 0, minute = 0): string | undefined => {
  if (!isPlausible(year, month, day)) return undefined;
  if (hour > 23 || minute > 59) return undefined;
  return new Date(Date.UTC(year, month - 1, day, hour, minute)).toISOString();
};

/**
 * Reads a time of day that trails a date, e.g. "at 14:00", "11:00 hrs", "2.00 pm".
 * Tender deadlines are frequently mid-afternoon, and treating them as midnight
 * would silently move the deadline a day earlier.
 */
const TRAILING_TIME = /^[\s,]*(?:at|by|before|not later than)?[\s,]*(\d{1,2})[:.](\d{2})\s*(am|pm|hrs|hours|h)?/i;

const readTrailingTime = (rest: string): { hour: number; minute: number } | undefined => {
  const match = TRAILING_TIME.exec(rest);
  if (!match) return undefined;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return undefined;
  return { hour, minute };
};

const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/g;
const NUMERIC_DATE = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})\b/g;
const DAY_FIRST = new RegExp(
  `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_PATTERN})\\.?,?\\s+(\\d{4})\\b`,
  'gi',
);
const MONTH_FIRST = new RegExp(`\\b(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'gi');

const push = (out: DateCandidate[], index: number, iso: string | undefined) => {
  if (iso) out.push({ index, iso });
};

/**
 * Finds every date in `text`, in document order.
 *
 * Purely numeric dates are read day-first (the convention on the UK, EU and UN
 * portals this plugin targets) unless the first component is impossible as a day
 * or the second is impossible as a month.
 */
export function findDates(text: string): DateCandidate[] {
  const out: DateCandidate[] = [];

  for (const m of text.matchAll(ISO_DATE)) {
    const [, y, mo, d, h, mi] = m;
    push(out, m.index, toIso(Number(y), Number(mo), Number(d), Number(h ?? 0), Number(mi ?? 0)));
  }

  for (const m of text.matchAll(NUMERIC_DATE)) {
    const first = Number(m[1]);
    const second = Number(m[2]);
    const year = Number(m[3]);
    const monthFirst = first <= 12 && second > 12;
    const day = monthFirst ? second : first;
    const month = monthFirst ? first : second;
    const time = readTrailingTime(text.slice(m.index + m[0].length));
    push(out, m.index, toIso(year, month, day, time?.hour, time?.minute));
  }

  for (const m of text.matchAll(DAY_FIRST)) {
    const time = readTrailingTime(text.slice(m.index + m[0].length));
    push(out, m.index, toIso(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]), time?.hour, time?.minute));
  }

  for (const m of text.matchAll(MONTH_FIRST)) {
    const time = readTrailingTime(text.slice(m.index + m[0].length));
    push(out, m.index, toIso(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2]), time?.hour, time?.minute));
  }

  return out.sort((a, b) => a.index - b.index);
}

/**
 * Returns the first date appearing within `window` characters after any of the
 * `cues`. Tender text states the cue before the date ("Closing date: 3 April
 * 2026"), so searching forward from the cue avoids grabbing the publication date.
 */
export function findDateNear(text: string, cues: string[], window = 220): string | undefined {
  const dates = findDates(text);
  if (!dates.length) return undefined;
  const haystack = text.toLowerCase();

  for (const cue of cues) {
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(cue, from);
      if (at === -1) break;
      const end = at + cue.length;
      const hit = dates.find((d) => d.index >= end && d.index - end <= window);
      if (hit) return hit.iso;
      from = end;
    }
  }
  return undefined;
}

/** Whole days from `from` to `to`, rounded down. Negative once the date has passed. */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}
