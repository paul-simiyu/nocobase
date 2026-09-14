/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import {
  briefToMarkdown,
  buildBidBrief,
  classifyUrgency,
  classifyVerdict,
  formatAmount,
  formatDate,
  formatEvaluation,
  formatRemaining,
  isBidBrief,
} from '../summary';
import type { ExtractedFields, RelevanceResult } from '../types';

const NOW = new Date('2026-03-01T00:00:00.000Z');

const relevance = (score: number): RelevanceResult => ({
  score,
  disciplines: ['branding'],
  matchedTerms: ['brand identity'],
  disqualifyingTerms: [],
});

const fields = (overrides: Partial<ExtractedFields> = {}): ExtractedFields => ({
  eligibility: [],
  mandatoryDocuments: [],
  requiresConsortium: false,
  requiresSiteVisit: false,
  ...overrides,
});

const brief = (f: Partial<ExtractedFields>, score = 80) =>
  buildBidBrief({
    title: 'Brand Identity Services',
    url: 'https://example.org/notice/1',
    sourceLabel: 'Find a Tender (UK)',
    relevance: relevance(score),
    fields: fields(f),
    now: NOW,
  });

describe('formatDate', () => {
  it('omits a midnight time and shows a real one', () => {
    expect(formatDate('2026-04-03T00:00:00.000Z')).toBe('3 Apr 2026');
    expect(formatDate('2026-04-03T14:30:00.000Z')).toBe('3 Apr 2026 14:30 UTC');
  });

  it('reports missing and invalid values as not stated', () => {
    expect(formatDate(undefined)).toBe('not stated');
    expect(formatDate('nonsense')).toBe('not stated');
  });
});

describe('formatAmount', () => {
  it('renders amounts, percentages and absences', () => {
    expect(formatAmount({ value: 12500000, currency: 'KES' })).toBe('KES 12,500,000');
    expect(formatAmount({ value: 2, isPercentage: true })).toBe('2% of bid price');
    expect(formatAmount(undefined)).toBe('not stated');
  });
});

describe('classifyUrgency', () => {
  it('bands the days remaining', () => {
    expect(classifyUrgency(undefined)).toBe('unknown');
    expect(classifyUrgency(-1)).toBe('expired');
    expect(classifyUrgency(7)).toBe('critical');
    expect(classifyUrgency(14)).toBe('tight');
    expect(classifyUrgency(30)).toBe('comfortable');
  });
});

describe('classifyVerdict', () => {
  it('bands the relevance score', () => {
    expect(classifyVerdict(70)).toBe('strong');
    expect(classifyVerdict(40)).toBe('possible');
    expect(classifyVerdict(39)).toBe('weak');
  });
});

describe('buildBidBrief', () => {
  it('computes days remaining against the injected clock', () => {
    const result = brief({ deadlineAt: '2026-03-21T00:00:00.000Z' });

    expect(result.timeline.daysRemaining).toBe(20);
    expect(result.timeline.urgency).toBe('comfortable');
  });

  it('flags a passed deadline as a risk', () => {
    const result = brief({ deadlineAt: '2026-02-01T00:00:00.000Z' });

    expect(result.timeline.urgency).toBe('expired');
    expect(result.risks.join(' ')).toContain('already passed');
  });

  it('warns when no deadline could be read', () => {
    const result = brief({});

    expect(result.timeline.urgency).toBe('unknown');
    expect(result.gaps).toContain('submission deadline');
  });

  it('raises bid security as a risk and a checklist action', () => {
    const result = brief({ bidSecurity: { value: 250000, currency: 'KES' }, deadlineAt: '2026-04-01T00:00:00.000Z' });

    expect(result.risks.join(' ')).toContain('bid security of KES 250,000');
    expect(result.checklist.join(' ')).toContain('bank for a bid security');
  });

  it('treats a future milestone as an action and a past one as a risk', () => {
    const future = brief({ clarificationDeadlineAt: '2026-03-10T00:00:00.000Z' });
    expect(future.checklist.join(' ')).toContain('Raise clarification questions');

    const past = brief({ clarificationDeadlineAt: '2026-02-10T00:00:00.000Z' });
    expect(past.checklist.join(' ')).not.toContain('Raise clarification questions');
    expect(past.risks.join(' ')).toContain('clarification window closed');
  });

  it('calls out a mandatory site visit that has already happened', () => {
    const result = brief({ siteVisitAt: '2026-02-10T00:00:00.000Z', requiresSiteVisit: true });

    expect(result.risks.join(' ')).toContain('eligibility is likely lost');
  });

  it('derives the missing evaluation weight for the checklist', () => {
    const result = brief({ evaluation: { technicalWeight: 80 } });

    expect(result.checklist.join(' ')).toContain('80/20');
  });

  it('lists every unfound field as a gap', () => {
    const result = brief({});

    expect(result.gaps).toEqual([
      'submission deadline',
      'estimated contract value',
      'bid security requirement',
      'evaluation criteria and weighting',
      'eligibility conditions',
      'mandatory document list',
      'submission channel',
      'contract duration',
    ]);
  });

  it('reports no gaps when everything was found', () => {
    const result = brief({
      deadlineAt: '2026-04-01T00:00:00.000Z',
      estimatedValue: { value: 1, currency: 'GBP' },
      bidSecurity: { value: 1, currency: 'GBP' },
      evaluation: { technicalWeight: 70, financialWeight: 30 },
      eligibility: ['Must be registered.'],
      mandatoryDocuments: ['Company profile.'],
      submissionChannel: 'portal',
      contractDurationMonths: 12,
    });

    expect(result.gaps).toEqual([]);
  });

  it('warns when disqualifying terms appear alongside creative scope', () => {
    const result = buildBidBrief({
      title: 'Campaign and Cleaning',
      url: 'https://example.org/2',
      sourceLabel: 'TED (EU)',
      relevance: {
        score: 50,
        disciplines: ['advertising'],
        matchedTerms: ['campaign'],
        disqualifyingTerms: ['cleaning services'],
      },
      fields: fields({}),
      now: NOW,
    });

    expect(result.risks.join(' ')).toContain('cleaning services');
  });
});

describe('briefToMarkdown', () => {
  const markdown = briefToMarkdown(
    brief({
      deadlineAt: '2026-04-03T14:30:00.000Z',
      estimatedValue: { value: 250000, currency: 'GBP' },
      evaluation: { technicalWeight: 70, financialWeight: 30, technicalThreshold: 75 },
    }),
  );

  it('leads with the title and the deadline', () => {
    expect(markdown).toContain('# Brand Identity Services');
    expect(markdown).toContain('Submission deadline: 3 Apr 2026 14:30 UTC');
  });

  it('states the fit and the evaluation split', () => {
    expect(markdown).toContain('## Fit: strong (80/100)');
    expect(markdown).toContain('70% technical / 30% financial, pass mark 75%');
  });

  it('says so explicitly where the notice was silent', () => {
    expect(markdown).toContain('Not stated in the notice');
  });

  it('carries the caveat that extraction is rule-based', () => {
    expect(markdown).toContain('extracted by rule');
  });
});

describe('formatRemaining', () => {
  it('distinguishes time left from time passed', () => {
    expect(formatRemaining(14)).toBe('14 day(s) left');
    expect(formatRemaining(-3)).toBe('3 day(s) ago');
    expect(formatRemaining(0)).toBe('0 day(s) left');
  });

  it('reports an unknown deadline as unknown, never as zero', () => {
    expect(formatRemaining(undefined)).toBe('unknown');
  });
});

describe('formatEvaluation', () => {
  it('renders the split and the pass mark', () => {
    expect(formatEvaluation({ technicalWeight: 70, financialWeight: 30, technicalThreshold: 75 })).toBe(
      '70% technical / 30% financial, pass mark 75%',
    );
  });

  it('omits a pass mark that was not stated', () => {
    expect(formatEvaluation({ technicalWeight: 80, financialWeight: 20 })).toBe('80% technical / 20% financial');
  });

  it('marks an unknown half rather than inventing it', () => {
    expect(formatEvaluation({ technicalWeight: 70 })).toBe('70% technical / ?% financial');
    expect(formatEvaluation(undefined)).toBe('not stated');
  });
});

describe('isBidBrief', () => {
  it('accepts a brief the builder produced', () => {
    expect(isBidBrief(brief({ deadlineAt: '2026-04-01T00:00:00.000Z' }))).toBe(true);
  });

  it('rejects anything missing a required section', () => {
    const partial = { headline: {}, timeline: {}, commercials: {}, fit: {}, requirements: {} };

    expect(isBidBrief(partial)).toBe(false);
  });

  it('rejects primitives, null and arrays', () => {
    for (const value of [null, undefined, 'brief', 42, []]) {
      expect(isBidBrief(value)).toBe(false);
    }
  });
});
