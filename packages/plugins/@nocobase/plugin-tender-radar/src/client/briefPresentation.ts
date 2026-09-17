/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { BidUrgency, BidVerdict, CreativeDiscipline } from '../shared/types';

/**
 * Colour mapping for the brief's two verdict-style badges.
 *
 * Kept free of React so it can be unit tested, and deliberately conservative:
 * only an expired or critical deadline earns red, so the colour still means
 * something when a table shows fifty rows at once.
 */

const VERDICT_COLORS: Record<BidVerdict, string> = {
  strong: 'green',
  possible: 'gold',
  weak: 'default',
};

const URGENCY_COLORS: Record<BidUrgency, string> = {
  expired: 'red',
  critical: 'red',
  tight: 'orange',
  comfortable: 'green',
  unknown: 'default',
};

export const verdictColor = (verdict: BidVerdict): string => VERDICT_COLORS[verdict] ?? 'default';

export const urgencyColor = (urgency: BidUrgency): string => URGENCY_COLORS[urgency] ?? 'default';

/**
 * Translation keys for the enum values the brief stores.
 *
 * The stored values are machine tokens (`graphicDesign`, `comfortable`); these
 * map them onto the same readable keys the collections already translate, so a
 * verdict is worded identically in a table cell and in the panel.
 */
export const verdictLabelKey: Record<BidVerdict, string> = {
  strong: 'Strong',
  possible: 'Possible',
  weak: 'Weak',
};

export const urgencyLabelKey: Record<BidUrgency, string> = {
  expired: 'Expired',
  critical: 'Critical',
  tight: 'Tight',
  comfortable: 'Comfortable',
  unknown: 'Unknown deadline',
};

export const disciplineLabelKey: Record<CreativeDiscipline, string> = {
  advertising: 'Advertising',
  branding: 'Branding',
  content: 'Content',
  digital: 'Digital',
  events: 'Events',
  graphicDesign: 'Graphic design',
  print: 'Print',
  publicRelations: 'Public relations',
  research: 'Research',
  video: 'Video',
};

/** Yes/no answers read better than raw booleans in a requirements table. */
export const yesNo = (value: boolean, t: (key: string) => string): string => (value ? t('Yes') : t('No'));
