/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import { extractFields, findAmounts, splitUnits, unwrap } from '../extract';

const NOTICE = `The Authority invites sealed bids for the provision of brand identity services.

Bidders must be registered with the Registrar of Companies and shall provide a certificate of
incorporation. Bidders must have a minimum of five (5) years of experience in similar assignments.
A valid tax compliance certificate is mandatory.

Interested bidders shall submit a company profile and copies of audited accounts.

The estimated contract value is KES 12,500,000. A bid security of KES 250,000 must accompany the bid.
Bids shall remain valid for a period of ninety (90) days. The contract shall run for a period of 24 months.

Evaluation: the technical proposal carries 70% and the financial proposal 30%. The pass mark is 75%.

A mandatory site visit will be held on 12 March 2026.
Clarifications shall be requested by 15 March 2026.
Closing date: 3rd April 2026 at 14:30 hrs. Bids must be submitted electronically through the e-procurement portal.`;

describe('findAmounts', () => {
  it('reads currency codes before and after the figure, and symbols', () => {
    expect(findAmounts('KES 250,000')[0]).toMatchObject({ value: 250000, currency: 'KES' });
    expect(findAmounts('250,000 KES')[0]).toMatchObject({ value: 250000, currency: 'KES' });
    expect(findAmounts('£250,000')[0]).toMatchObject({ value: 250000, currency: 'GBP' });
    expect(findAmounts('€1 000 000')[0]).toMatchObject({ value: 1000000, currency: 'EUR' });
  });

  it('applies magnitude words', () => {
    expect(findAmounts('USD 1.2 million')[0]).toMatchObject({ value: 1200000, currency: 'USD' });
    expect(findAmounts('USD 5k')[0]).toMatchObject({ value: 5000, currency: 'USD' });
  });
});

describe('unwrap', () => {
  it('rejoins hard-wrapped prose but keeps list items apart', () => {
    expect(unwrap('a requirement that\ncontinues here.')).toBe('a requirement that continues here.');
    expect(unwrap('Requirements:\n- first item\n- second item')).toBe('Requirements:\n- first item\n- second item');
  });
});

describe('splitUnits', () => {
  it('strips bullets and numbering', () => {
    const units = splitUnits('- A requirement of some length here.\n(b) Another requirement of length.');

    expect(units[0]).toBe('A requirement of some length here.');
    expect(units[1]).toBe('Another requirement of length.');
  });
});

describe('extractFields', () => {
  const fields = extractFields({ title: 'Provision of Brand Identity Services', description: NOTICE });

  it('reads the submission deadline with its time of day', () => {
    expect(fields.deadlineAt).toBe('2026-04-03T14:30:00.000Z');
  });

  it('separates the clarification and site-visit dates from the deadline', () => {
    expect(fields.clarificationDeadlineAt).toBe('2026-03-15T00:00:00.000Z');
    expect(fields.siteVisitAt).toBe('2026-03-12T00:00:00.000Z');
  });

  it('distinguishes the contract value from the bid security', () => {
    expect(fields.estimatedValue).toMatchObject({ value: 12500000, currency: 'KES' });
    expect(fields.bidSecurity).toMatchObject({ value: 250000, currency: 'KES' });
  });

  it('prefers the parenthesised numeral for validity and duration', () => {
    expect(fields.bidValidityDays).toBe(90);
    expect(fields.contractDurationMonths).toBe(24);
  });

  it('reads the evaluation split and pass mark', () => {
    expect(fields.evaluation).toEqual({ technicalWeight: 70, financialWeight: 30, technicalThreshold: 75 });
  });

  it('detects the submission channel and mandatory site visit', () => {
    expect(fields.submissionChannel).toBe('portal');
    expect(fields.requiresSiteVisit).toBe(true);
    expect(fields.requiresConsortium).toBe(false);
  });

  it('collects complete eligibility sentences rather than wrapped fragments', () => {
    expect(fields.eligibility).toContain(
      'Bidders must be registered with the Registrar of Companies and shall provide a certificate of incorporation.',
    );
  });

  it('lists mandatory documents', () => {
    expect(fields.mandatoryDocuments.length).toBeGreaterThan(0);
  });

  it('lets structured source values override parsed prose', () => {
    const overridden = extractFields({
      title: 'x',
      description: NOTICE,
      deadlineAt: '2026-05-01T09:00:00.000Z',
      estimatedValue: 999,
      currency: 'GBP',
      lotCount: 4,
    });

    expect(overridden.deadlineAt).toBe('2026-05-01T09:00:00.000Z');
    expect(overridden.estimatedValue).toEqual({ value: 999, currency: 'GBP' });
    expect(overridden.lotCount).toBe(4);
  });

  it('leaves fields undefined rather than guessing when the notice is silent', () => {
    const sparse = extractFields({ title: 'Design services', description: 'No further details.' });

    expect(sparse.deadlineAt).toBeUndefined();
    expect(sparse.estimatedValue).toBeUndefined();
    expect(sparse.bidSecurity).toBeUndefined();
    expect(sparse.evaluation).toBeUndefined();
    expect(sparse.eligibility).toEqual([]);
  });

  it('reads a bid security expressed as a percentage', () => {
    const fromPercent = extractFields({
      title: 'x',
      description: 'A bid security of 2% of the bid price is required.',
    });

    expect(fromPercent.bidSecurity).toEqual({ value: 2, isPercentage: true });
  });

  it('detects a consortium requirement', () => {
    expect(
      extractFields({ title: 'x', description: 'Bids from a joint venture are welcome.' }).requiresConsortium,
    ).toBe(true);
  });

  it('reads the lot count from prose', () => {
    expect(extractFields({ title: 'x', description: 'The tender is divided into 5 lots.' }).lotCount).toBe(5);
  });
});
