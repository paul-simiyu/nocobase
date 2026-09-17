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
  disciplineLabelKey,
  urgencyColor,
  urgencyLabelKey,
  verdictColor,
  verdictLabelKey,
  yesNo,
} from '../briefPresentation';
import type { BidUrgency, BidVerdict, CreativeDiscipline } from '../../shared/types';

describe('verdictColor', () => {
  it('reserves green for a strong fit and stays neutral for a weak one', () => {
    expect(verdictColor('strong')).toBe('green');
    expect(verdictColor('possible')).toBe('gold');
    expect(verdictColor('weak')).toBe('default');
  });
});

describe('urgencyColor', () => {
  it('uses red only where the deadline is gone or nearly gone', () => {
    expect(urgencyColor('expired')).toBe('red');
    expect(urgencyColor('critical')).toBe('red');
    expect(urgencyColor('tight')).toBe('orange');
    expect(urgencyColor('comfortable')).toBe('green');
  });

  it('does not colour an unknown deadline as safe', () => {
    expect(urgencyColor('unknown')).toBe('default');
    expect(urgencyColor('unknown')).not.toBe('green');
  });
});

describe('yesNo', () => {
  it('renders booleans through the caller translator', () => {
    const t = (key: string) => (key === 'Yes' ? 'Oui' : 'Non');

    expect(yesNo(true, t)).toBe('Oui');
    expect(yesNo(false, t)).toBe('Non');
  });
});

describe('label maps', () => {
  it('covers every verdict', () => {
    const verdicts: BidVerdict[] = ['strong', 'possible', 'weak'];

    expect(Object.keys(verdictLabelKey).sort()).toEqual([...verdicts].sort());
  });

  it('covers every urgency band', () => {
    const bands: BidUrgency[] = ['expired', 'critical', 'tight', 'comfortable', 'unknown'];

    expect(Object.keys(urgencyLabelKey).sort()).toEqual([...bands].sort());
  });

  it('covers every creative discipline the scorer can report', () => {
    const disciplines: CreativeDiscipline[] = [
      'branding',
      'graphicDesign',
      'advertising',
      'digital',
      'content',
      'video',
      'publicRelations',
      'events',
      'print',
      'research',
    ];

    expect(Object.keys(disciplineLabelKey).sort()).toEqual([...disciplines].sort());
  });

  it('never maps an enum value to an empty label', () => {
    const all = { ...verdictLabelKey, ...urgencyLabelKey, ...disciplineLabelKey };

    for (const value of Object.values(all)) {
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
