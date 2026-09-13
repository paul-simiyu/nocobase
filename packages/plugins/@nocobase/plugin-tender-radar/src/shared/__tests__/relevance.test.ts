/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import { scoreRelevance } from '../relevance';

describe('scoreRelevance', () => {
  it('scores an unambiguous creative brief highly and names the disciplines', () => {
    const result = scoreRelevance({
      title: 'Provision of Brand Identity and Visual Identity Design Services',
      description: 'The agency will develop a brand strategy, brand guidelines and logo design.',
    });

    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.disciplines).toContain('branding');
    expect(result.matchedTerms).toContain('brand identity');
    expect(result.disqualifyingTerms).toEqual([]);
  });

  it('weights the title above the body', () => {
    const inTitle = scoreRelevance({ title: 'Graphic design services', description: '' });
    const inBody = scoreRelevance({ title: 'Provision of services', description: 'Graphic design services.' });

    expect(inTitle.score).toBeGreaterThan(inBody.score);
  });

  it('caps body weight so a long document cannot out-shout the title', () => {
    const repeated = Array.from({ length: 40 }, () => 'graphic design and copywriting and video production').join('. ');
    const result = scoreRelevance({ title: 'Notice', description: repeated });

    expect(result.score).toBeLessThanOrEqual(60);
  });

  it('rejects construction work that merely uses the word design', () => {
    const result = scoreRelevance({
      title: 'Construction of a Water Supply System',
      description: 'Detailed design of civil works and borehole drilling.',
    });

    expect(result.score).toBe(0);
    expect(result.disqualifyingTerms).toContain('civil works');
  });

  it('rejects goods supply', () => {
    expect(
      scoreRelevance({ title: 'Supply and Delivery of Office Furniture', description: 'Furniture supply.' }).score,
    ).toBe(0);
  });

  it('treats a creative CPV code as authoritative when the prose is vague', () => {
    const result = scoreRelevance({
      title: 'Framework Agreement',
      description: 'Services as described in the specification.',
      cpvCodes: ['79822500'],
    });

    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it('ignores CPV codes outside the creative range', () => {
    const result = scoreRelevance({ title: 'Framework Agreement', description: '', cpvCodes: ['45000000'] });

    expect(result.score).toBeLessThan(25);
  });

  it('still surfaces a genuine campaign that mentions printed material supply', () => {
    const result = scoreRelevance({
      title: 'Advertising Campaign and Brand Identity Services',
      description: 'Includes supply and delivery of branded merchandise and brochures.',
    });

    expect(result.score).toBeGreaterThanOrEqual(40);
  });

  it('matches across a line break', () => {
    const result = scoreRelevance({ title: 'Notice', description: 'Requires graphic\ndesign services.' });

    expect(result.matchedTerms).toContain('graphic design');
  });

  it('is case insensitive', () => {
    expect(scoreRelevance({ title: 'BRAND IDENTITY SERVICES', description: '' }).disciplines).toContain('branding');
  });

  it('never reports a score outside 0-100', () => {
    const high = scoreRelevance({
      title: 'Brand identity, graphic design, advertising campaign, website design, video production',
      description: 'copywriting public relations event management printing services market research',
    });

    expect(high.score).toBeLessThanOrEqual(100);
    expect(high.score).toBeGreaterThanOrEqual(0);
  });
});
