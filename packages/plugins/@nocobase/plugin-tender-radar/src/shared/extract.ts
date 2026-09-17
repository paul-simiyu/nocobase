/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { findDateNear } from './dates';
import type { ExtractedFields, MonetaryAmount } from './types';

const CURRENCY_CODES = [
  'KES',
  'USD',
  'EUR',
  'GBP',
  'ZAR',
  'NGN',
  'TZS',
  'UGX',
  'RWF',
  'ETB',
  'GHS',
  'CHF',
  'AUD',
  'CAD',
  'INR',
  'JPY',
  'SEK',
  'NOK',
  'DKK',
  'XOF',
  'XAF',
];

const SYMBOL_TO_CODE: Record<string, string> = { $: 'USD', '£': 'GBP', '€': 'EUR', '₦': 'NGN', '₹': 'INR' };

const MULTIPLIERS: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mn: 1e6,
  million: 1e6,
  bn: 1e9,
  billion: 1e9,
};

const AMOUNT = String.raw`\d{1,3}(?:[,\s]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`;
const MULT = String.raw`(?:\s*(k|m|mn|bn|thousand|million|billion)\b)?`;

/** "KES 5,000,000", "USD 1.2 million" */
const CODE_FIRST = new RegExp(String.raw`\b(${CURRENCY_CODES.join('|')})\s*(${AMOUNT})${MULT}`, 'gi');
/** "£250,000", "€1 000 000" */
const SYMBOL_FIRST = new RegExp(String.raw`([$£€₦₹])\s*(${AMOUNT})${MULT}`, 'gi');
/** "5,000,000 KES" */
const CODE_LAST = new RegExp(String.raw`\b(${AMOUNT})${MULT}\s*(${CURRENCY_CODES.join('|')})\b`, 'gi');
const PERCENTAGE = /(\d{1,2}(?:\.\d+)?)\s*(?:%|per\s?cent)/gi;

const toNumber = (raw: string, multiplier?: string): number => {
  const base = Number(raw.replace(/[,\s]/g, ''));
  if (!Number.isFinite(base)) return NaN;
  return base * (multiplier ? MULTIPLIERS[multiplier.toLowerCase()] ?? 1 : 1);
};

interface AmountCandidate extends MonetaryAmount {
  index: number;
}

/** Every monetary figure in the text, in document order. */
export function findAmounts(text: string): AmountCandidate[] {
  const out: AmountCandidate[] = [];

  for (const m of text.matchAll(CODE_FIRST)) {
    const value = toNumber(m[2], m[3]);
    if (Number.isFinite(value)) out.push({ index: m.index, value, currency: m[1].toUpperCase() });
  }
  for (const m of text.matchAll(SYMBOL_FIRST)) {
    const value = toNumber(m[2], m[3]);
    if (Number.isFinite(value)) out.push({ index: m.index, value, currency: SYMBOL_TO_CODE[m[1]] });
  }
  for (const m of text.matchAll(CODE_LAST)) {
    const value = toNumber(m[1], m[2]);
    if (Number.isFinite(value)) out.push({ index: m.index, value, currency: m[3].toUpperCase() });
  }

  return out.sort((a, b) => a.index - b.index);
}

const findNear = <T extends { index: number }>(items: T[], text: string, cues: string[], window: number) => {
  const haystack = text.toLowerCase();
  for (const cue of cues) {
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(cue, from);
      if (at === -1) break;
      const end = at + cue.length;
      const hit = items.find((item) => item.index >= end && item.index - end <= window);
      if (hit) return hit;
      from = end;
    }
  }
  return undefined;
};

/** The first monetary figure stated within `window` characters after any cue. */
export function findAmountNear(text: string, cues: string[], window = 160): MonetaryAmount | undefined {
  const hit = findNear(findAmounts(text), text, cues, window);
  return hit ? { value: hit.value, currency: hit.currency } : undefined;
}

function findPercentageNear(text: string, cues: string[], window = 160): number | undefined {
  const items = [...text.matchAll(PERCENTAGE)].map((m) => ({ index: m.index, value: Number(m[1]) }));
  return findNear(items, text, cues, window)?.value;
}

const DEADLINE_CUES = [
  'submission deadline',
  'deadline for submission',
  'closing date',
  'closing time',
  'closes on',
  'bids must be received',
  'proposals must be received',
  'must be submitted by',
  'due by',
  'last date for submission',
  'deadline',
  'time for receipt of tenders',
];
const CLARIFICATION_CUES = [
  'clarification',
  'clarifications',
  'queries',
  'questions must be',
  'request for information deadline',
];
const SITE_VISIT_CUES = [
  'site visit',
  'pre-bid meeting',
  'pre bid meeting',
  'pre-proposal conference',
  'site inspection',
];
const VALUE_CUES = [
  'estimated value',
  'estimated contract value',
  'contract value',
  'total budget',
  'budget',
  'budget ceiling',
  'estimated cost',
  'maximum value',
  'contract is estimated',
];
const SECURITY_CUES = [
  'bid bond',
  'bid security',
  'tender security',
  'tender guarantee',
  'earnest money',
  'proposal security',
];

/**
 * Bid validity, e.g. "valid for a period of ninety (90) days". The parenthesised
 * numeral is preferred because tenders almost always restate the figure in digits.
 */
const VALIDITY = /valid(?:ity)?[^.]{0,80}?(?:\((\d{1,3})\)|(\d{1,3}))\s*(?:calendar\s*)?days/i;
const DURATION_MONTHS = /(?:period|duration|term)[^.]{0,60}?(?:\((\d{1,3})\)|(\d{1,3}))\s*(?:calendar\s*)?months/i;
const DURATION_YEARS = /(?:period|duration|term)[^.]{0,60}?(?:\((\d{1,2})\)|(\d{1,2}))\s*(?:calendar\s*)?years?/i;
const LOTS = /(?:divided into|comprises|consists of)?\s*(\d{1,2})\s*lots\b/i;

const firstGroup = (match: RegExpMatchArray | null): number | undefined => {
  if (!match) return undefined;
  const raw = match[1] ?? match[2];
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
};

const ELIGIBILITY_CUES = [
  'must be registered',
  'shall be registered',
  'duly registered',
  'certificate of incorporation',
  'tax compliance',
  'valid tax',
  'vat registration',
  'years of experience',
  'years experience',
  'annual turnover',
  'similar assignments',
  'similar projects',
  'professional indemnity',
  'shall not be debarred',
  'not be debarred',
  'eligibility',
  'eligible bidders',
  'must demonstrate',
  'minimum requirement',
  'mandatory requirement',
  'pre-qualification',
  'prequalification',
  'agpo',
  'cr12',
  'b-bbee',
  'audited accounts',
  'financial statements',
];

const DOCUMENT_CUES = [
  'certificate of',
  'copy of',
  'copies of',
  'attach',
  'attached',
  'shall submit',
  'must submit',
  'must include',
  'documentary evidence',
  'duly filled',
  'duly signed',
  'company profile',
  'curriculum vitae',
  'cvs of',
  'portfolio',
  'references',
  'letter of',
  'power of attorney',
];

const CONSORTIUM = /\b(joint venture|consortium|consortia|jv partner|in association with)\b/i;
const MANDATORY_VISIT = /\b(mandatory|compulsory|obligatory)\b[^.]{0,60}\b(site visit|pre-?bid)\b/i;

const BULLET_START = /^\s*(?:[\u2022*\u2013\u2014-]|\(?[a-z0-9]{1,3}[).])\s+/i;

/**
 * Rejoins hard-wrapped lines. Portal descriptions arrive wrapped at ~90 columns,
 * and splitting on every newline would cut requirement sentences in half.
 * A line continues the previous one unless the previous line closed a sentence
 * or the current line opens a list item.
 */
export function unwrap(text: string): string {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push('');
      continue;
    }
    const prev = out[out.length - 1];
    const continues = Boolean(prev) && !/[.;:!?]$/.test(prev) && !BULLET_START.test(line);
    if (continues) {
      out[out.length - 1] = `${prev} ${trimmed}`;
    } else {
      out.push(trimmed);
    }
  }
  return out.join('\n');
}

/**
 * Splits a notice into sentences and list items so each can be classified on its
 * own. Tender documents mix prose with bulleted requirement lists, and treating
 * the whole body as one blob loses the list structure entirely.
 */
export function splitUnits(text: string): string[] {
  return unwrap(text)
    .split(/\r?\n+|(?<=[.;])\s+/)
    .map((unit) =>
      unit
        .replace(/^[\s•*•–—-]+/, '')
        .replace(/^\(?[a-z0-9]{1,3}[).]\s+/i, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((unit) => unit.length >= 12 && unit.length <= 400);
}

const collect = (units: string[], cues: string[], cap: number): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const unit of units) {
    const lower = unit.toLowerCase();
    if (!cues.some((cue) => lower.includes(cue))) continue;
    const key = lower.replace(/[^a-z0-9]/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(unit);
    if (out.length >= cap) break;
  }
  return out;
};

const PORTAL_SUBMISSION =
  /e-?procurement|electronic submission|through the portal|upload(?:ed)? (?:to|via)|e-?tender|online submission|submitted electronically/;
const PHYSICAL_SUBMISSION = /sealed (?:envelope|bid|tender)|tender box|hand[- ]deliver|physically deliver|posted to/;
const EMAIL_SUBMISSION = /(?:submit|send|email)[^.]{0,40}@|by e-?mail/;

/** Portal beats email beats physical: a portal notice often lists an email too. */
const detectChannel = (text: string): ExtractedFields['submissionChannel'] => {
  const lower = text.toLowerCase();
  if (PORTAL_SUBMISSION.test(lower)) return 'portal';
  if (PHYSICAL_SUBMISSION.test(lower)) return 'physical';
  if (EMAIL_SUBMISSION.test(lower)) return 'email';
  return undefined;
};

export interface ExtractInput {
  title: string;
  description: string;
  /** Structured values from the source API, which always beat parsed prose. */
  deadlineAt?: string;
  clarificationDeadlineAt?: string;
  estimatedValue?: number;
  currency?: string;
  lotCount?: number;
}

/**
 * Pulls the bid-critical facts out of a notice using deterministic rules.
 *
 * Anything absent is left `undefined` rather than guessed - callers surface those
 * as gaps so a bid team knows to read the tender document itself.
 */
export function extractFields(input: ExtractInput): ExtractedFields {
  const text = `${input.title}\n${input.description}`;
  const units = splitUnits(text);

  const bidSecurityPercentage = findPercentageNear(text, SECURITY_CUES);
  const bidSecurityAmount = findAmountNear(text, SECURITY_CUES);
  const bidSecurity: MonetaryAmount | undefined = bidSecurityAmount
    ? bidSecurityAmount
    : bidSecurityPercentage !== undefined
      ? { value: bidSecurityPercentage, isPercentage: true }
      : undefined;

  const parsedValue = findAmountNear(text, VALUE_CUES);
  const estimatedValue: MonetaryAmount | undefined =
    input.estimatedValue !== undefined ? { value: input.estimatedValue, currency: input.currency } : parsedValue;

  const technicalWeight = findPercentageNear(text, ['technical']);
  const financialWeight = findPercentageNear(text, ['financial', 'price', 'commercial']);
  const technicalThreshold = findPercentageNear(text, ['minimum technical', 'technical threshold', 'pass mark']);
  const evaluation =
    technicalWeight === undefined && financialWeight === undefined && technicalThreshold === undefined
      ? undefined
      : { technicalWeight, financialWeight, technicalThreshold };

  const durationYears = firstGroup(DURATION_YEARS.exec(text));
  const durationMonths =
    firstGroup(DURATION_MONTHS.exec(text)) ?? (durationYears !== undefined ? durationYears * 12 : undefined);

  return {
    deadlineAt: input.deadlineAt ?? findDateNear(text, DEADLINE_CUES),
    clarificationDeadlineAt: input.clarificationDeadlineAt ?? findDateNear(text, CLARIFICATION_CUES),
    siteVisitAt: findDateNear(text, SITE_VISIT_CUES),
    estimatedValue,
    bidSecurity,
    bidValidityDays: firstGroup(VALIDITY.exec(text)),
    contractDurationMonths: durationMonths,
    evaluation,
    submissionChannel: detectChannel(text),
    eligibility: collect(units, ELIGIBILITY_CUES, 8),
    mandatoryDocuments: collect(units, DOCUMENT_CUES, 10),
    requiresConsortium: CONSORTIUM.test(text),
    requiresSiteVisit: MANDATORY_VISIT.test(text),
    lotCount: input.lotCount ?? firstGroup(LOTS.exec(text)),
  };
}
