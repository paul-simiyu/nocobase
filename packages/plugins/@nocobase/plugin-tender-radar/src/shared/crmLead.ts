/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { briefToMarkdown, formatAmount, formatDate, isBidBrief } from './summary';
import type { BidBrief, CreativeDiscipline, JsonValue } from './types';

/**
 * A CRM-neutral lead.
 *
 * Every destination names its columns differently, so the tender is mapped onto
 * this shape once and a per-target field map renames it on the way out. Adding a
 * CRM then means adding a mapping row, not another builder.
 */
export interface CrmLead {
  /** Short, human-scannable lead name. */
  title: string;
  organisation?: string;
  country?: string;
  /** Where the lead came from, for CRM source reporting. */
  source: string;
  sourceUrl: string;
  /** Plain-text summary suitable for a notes field. */
  description: string;
  /** The full brief as markdown, for CRMs with a rich-text field. */
  brief?: string;
  estimatedValue?: number;
  currency?: string;
  /** The submission deadline - the date the opportunity is decided. */
  expectedCloseDate?: string;
  relevanceScore?: number;
  disciplines?: CreativeDiscipline[];
  /**
   * Stable reference back to the tender. Sending it lets the CRM de-duplicate
   * independently of whether this plugin remembers having sent it.
   */
  externalRef: string;
}

/** The tender columns the lead builder reads. */
export interface TenderForCrm {
  dedupeKey: string;
  title: string;
  buyer?: string | null;
  country?: string | null;
  url: string;
  sourceName?: string | null;
  deadlineAt?: string | Date | null;
  estimatedValue?: number | null;
  currency?: string | null;
  relevanceScore?: number | null;
  disciplines?: unknown;
  bidBrief?: unknown;
}

const clean = (value: string | null | undefined): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

const toIso = (value: string | Date | null | undefined): string | undefined => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const readDisciplines = (value: unknown): CreativeDiscipline[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is CreativeDiscipline => typeof item === 'string');
  return items.length ? items : undefined;
};

/**
 * One-paragraph summary for CRMs whose lead notes are plain text.
 *
 * States the deadline and value first because those are what a salesperson
 * triages on, and says "not stated" rather than leaving a blank that reads as
 * "nothing required".
 */
export function summariseForCrm(tender: TenderForCrm, brief?: BidBrief): string {
  const deadline = toIso(tender.deadlineAt);
  const parts = [
    `${clean(tender.buyer) ?? 'Unnamed buyer'} - ${tender.title}.`,
    `Deadline: ${formatDate(deadline)}.`,
    `Estimated value: ${formatAmount(
      tender.estimatedValue === null || tender.estimatedValue === undefined
        ? undefined
        : { value: tender.estimatedValue, currency: clean(tender.currency) },
    )}.`,
  ];

  if (brief) {
    parts.push(`Fit: ${brief.fit.verdict} (${brief.fit.score}/100).`);
    if (brief.risks.length) {
      parts.push(`Top risk: ${brief.risks[0]}`);
    }
    if (brief.gaps.length) {
      parts.push(`Not stated in the notice: ${brief.gaps.join(', ')}.`);
    }
  }

  parts.push(`Notice: ${tender.url}`);
  return parts.join(' ');
}

/** Maps a harvested tender onto the canonical lead. */
export function buildCrmLead(tender: TenderForCrm, sourceLabel = 'Tender radar'): CrmLead {
  const brief = isBidBrief(tender.bidBrief) ? tender.bidBrief : undefined;
  const sourceName = clean(tender.sourceName);

  return {
    title: tender.title,
    organisation: clean(tender.buyer),
    country: clean(tender.country),
    source: sourceName ? `${sourceLabel}: ${sourceName}` : sourceLabel,
    sourceUrl: tender.url,
    description: summariseForCrm(tender, brief),
    brief: brief ? briefToMarkdown(brief) : undefined,
    estimatedValue: typeof tender.estimatedValue === 'number' ? tender.estimatedValue : undefined,
    currency: clean(tender.currency),
    expectedCloseDate: toIso(tender.deadlineAt),
    relevanceScore: typeof tender.relevanceScore === 'number' ? tender.relevanceScore : undefined,
    disciplines: readDisciplines(tender.disciplines),
    externalRef: tender.dedupeKey,
  };
}

/** Destination field name per canonical key; an omitted key is not sent. */
export type CrmFieldMap = Partial<Record<keyof CrmLead, string>>;

export const DEFAULT_FIELD_MAP: CrmFieldMap = {
  title: 'title',
  organisation: 'company',
  country: 'country',
  source: 'source',
  sourceUrl: 'website',
  description: 'description',
  estimatedValue: 'estimatedValue',
  currency: 'currency',
  expectedCloseDate: 'expectedCloseDate',
  relevanceScore: 'score',
  externalRef: 'externalRef',
};

const toJsonValue = (value: unknown): JsonValue | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    const items = value.map(toJsonValue).filter((item): item is JsonValue => item !== undefined);
    return items.length ? items : undefined;
  }
  return undefined;
};

/**
 * Renames the canonical lead onto the destination's own columns.
 *
 * Unmapped and empty values are dropped rather than sent as null, so a CRM that
 * rejects unknown columns or overwrites defaults with null is not upset by
 * fields this tender happened not to have.
 */
export function applyFieldMap(
  lead: CrmLead,
  fieldMap: CrmFieldMap = DEFAULT_FIELD_MAP,
  defaults: Record<string, JsonValue> = {},
): Record<string, JsonValue> {
  const payload: Record<string, JsonValue> = { ...defaults };

  for (const [canonicalKey, destinationKey] of Object.entries(fieldMap)) {
    if (!destinationKey) continue;
    const value = toJsonValue(lead[canonicalKey as keyof CrmLead]);
    if (value !== undefined) {
      payload[destinationKey] = value;
    }
  }

  return payload;
}
