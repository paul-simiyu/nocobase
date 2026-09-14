/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import { applyFieldMap, buildCrmLead, DEFAULT_FIELD_MAP, summariseForCrm, type TenderForCrm } from '../crmLead';
import { buildBidBrief } from '../summary';
import type { ExtractedFields, RelevanceResult } from '../types';

const relevance: RelevanceResult = {
  score: 85,
  disciplines: ['branding'],
  matchedTerms: ['brand identity'],
  disqualifyingTerms: [],
};

const fields: ExtractedFields = {
  deadlineAt: '2026-04-03T14:30:00.000Z',
  eligibility: [],
  mandatoryDocuments: [],
  requiresConsortium: false,
  requiresSiteVisit: false,
};

const brief = buildBidBrief({
  title: 'Brand Identity Services',
  url: 'https://example.org/notice/1',
  sourceLabel: 'Find a Tender (UK)',
  relevance,
  fields,
  now: new Date('2026-03-01T00:00:00.000Z'),
});

const tender = (overrides: Partial<TenderForCrm> = {}): TenderForCrm => ({
  dedupeKey: 'find-a-tender:ocds-1',
  title: 'Brand Identity Services',
  buyer: 'Arts Council',
  country: 'United Kingdom',
  url: 'https://example.org/notice/1',
  sourceName: 'Find a Tender (UK)',
  deadlineAt: '2026-04-03T14:30:00.000Z',
  estimatedValue: 250000,
  currency: 'GBP',
  relevanceScore: 85,
  disciplines: ['branding'],
  bidBrief: brief,
  ...overrides,
});

describe('buildCrmLead', () => {
  it('maps the tender onto the canonical lead', () => {
    const lead = buildCrmLead(tender());

    expect(lead).toMatchObject({
      title: 'Brand Identity Services',
      organisation: 'Arts Council',
      country: 'United Kingdom',
      source: 'Tender radar: Find a Tender (UK)',
      sourceUrl: 'https://example.org/notice/1',
      estimatedValue: 250000,
      currency: 'GBP',
      expectedCloseDate: '2026-04-03T14:30:00.000Z',
      relevanceScore: 85,
      externalRef: 'find-a-tender:ocds-1',
    });
  });

  it('carries the deadline as the expected close date, so the CRM can forecast', () => {
    expect(buildCrmLead(tender()).expectedCloseDate).toBe('2026-04-03T14:30:00.000Z');
  });

  it('accepts a Date as well as a string deadline', () => {
    const lead = buildCrmLead(tender({ deadlineAt: new Date('2026-05-01T09:00:00.000Z') }));

    expect(lead.expectedCloseDate).toBe('2026-05-01T09:00:00.000Z');
  });

  it('attaches the markdown brief when one is stored', () => {
    expect(buildCrmLead(tender()).brief).toContain('# Brand Identity Services');
  });

  it('omits the brief when the column holds something else', () => {
    expect(buildCrmLead(tender({ bidBrief: 'not a brief' })).brief).toBeUndefined();
  });

  it('drops blank strings rather than sending empty values', () => {
    const lead = buildCrmLead(tender({ buyer: '   ', country: null, currency: '' }));

    expect(lead.organisation).toBeUndefined();
    expect(lead.country).toBeUndefined();
    expect(lead.currency).toBeUndefined();
  });

  it('falls back to the plain source label when the tender names no source', () => {
    expect(buildCrmLead(tender({ sourceName: null })).source).toBe('Tender radar');
  });

  it('ignores a disciplines column that is not an array of strings', () => {
    expect(buildCrmLead(tender({ disciplines: 'branding' })).disciplines).toBeUndefined();
    expect(buildCrmLead(tender({ disciplines: [1, 2] })).disciplines).toBeUndefined();
  });
});

describe('summariseForCrm', () => {
  it('leads with the buyer, deadline and value', () => {
    const summary = summariseForCrm(tender(), brief);

    expect(summary).toContain('Arts Council - Brand Identity Services.');
    expect(summary).toContain('Deadline: 3 Apr 2026 14:30 UTC.');
    expect(summary).toContain('Estimated value: GBP 250,000.');
  });

  it('says what the notice never stated instead of leaving it blank', () => {
    expect(summariseForCrm(tender(), brief)).toContain('Not stated in the notice:');
  });

  it('reads an absent value as not stated rather than as zero', () => {
    expect(summariseForCrm(tender({ estimatedValue: null }))).toContain('Estimated value: not stated.');
  });

  it('names an unnamed buyer explicitly', () => {
    expect(summariseForCrm(tender({ buyer: null }))).toContain('Unnamed buyer');
  });
});

describe('applyFieldMap', () => {
  it('renames canonical keys onto the destination columns', () => {
    const payload = applyFieldMap(buildCrmLead(tender()), { title: 'subject', organisation: 'account_name' });

    expect(payload).toEqual({ subject: 'Brand Identity Services', account_name: 'Arts Council' });
  });

  it('drops unmapped keys entirely', () => {
    const payload = applyFieldMap(buildCrmLead(tender()), { title: 'subject' });

    expect(Object.keys(payload)).toEqual(['subject']);
  });

  it('omits values the tender does not have, rather than sending null', () => {
    const payload = applyFieldMap(buildCrmLead(tender({ buyer: null })), DEFAULT_FIELD_MAP);

    expect('company' in payload).toBe(false);
  });

  it('merges default values, which a mapped field can override', () => {
    const payload = applyFieldMap(buildCrmLead(tender()), { title: 'title' }, { owner: 'sales', title: 'placeholder' });

    expect(payload.owner).toBe('sales');
    expect(payload.title).toBe('Brand Identity Services');
  });

  it('uses the default map when none is configured', () => {
    const payload = applyFieldMap(buildCrmLead(tender()));

    expect(payload.company).toBe('Arts Council');
    expect(payload.externalRef).toBe('find-a-tender:ocds-1');
  });
});
