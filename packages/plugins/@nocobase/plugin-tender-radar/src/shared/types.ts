/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/** A JSON value as it arrives from a third-party procurement API. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

/**
 * The creative disciplines the radar knows how to recognise. Scoring a notice
 * against these is what separates "brand identity framework" from "supply of
 * office furniture" on portals that carry both.
 */
export type CreativeDiscipline =
  | 'branding'
  | 'graphicDesign'
  | 'advertising'
  | 'digital'
  | 'content'
  | 'video'
  | 'publicRelations'
  | 'events'
  | 'print'
  | 'research';

/** Normalised shape every source adapter must produce. */
export interface RawNotice {
  /** Stable identifier within the source. Combined with `sourceKey` it de-duplicates. */
  externalId: string;
  title: string;
  description: string;
  url: string;
  buyer?: string;
  country?: string;
  noticeType?: string;
  publishedAt?: string;
  /** Deadline as published in a structured field, when the source provides one. */
  deadlineAt?: string;
  /** Close of the questions/enquiry window, when the source publishes it structurally. */
  clarificationDeadlineAt?: string;
  estimatedValue?: number;
  currency?: string;
  cpvCodes?: string[];
  lotCount?: number;
  /** The untouched source payload, kept for audit and for re-parsing later. */
  raw: JsonObject;
}

export interface RelevanceResult {
  /** 0-100. Higher means a closer fit to creative-agency service work. */
  score: number;
  disciplines: CreativeDiscipline[];
  /** Terms that drove the score, for explainability. */
  matchedTerms: string[];
  /** Terms that suggest the notice is for something else entirely. */
  disqualifyingTerms: string[];
}

export interface MonetaryAmount {
  value: number;
  currency?: string;
  /** True when the figure was expressed as a percentage of the bid price. */
  isPercentage?: boolean;
}

/** Everything the rule-based extractor could establish from the notice text. */
export interface ExtractedFields {
  deadlineAt?: string;
  clarificationDeadlineAt?: string;
  siteVisitAt?: string;
  estimatedValue?: MonetaryAmount;
  bidSecurity?: MonetaryAmount;
  /** How long a submitted bid must stay open, in days. */
  bidValidityDays?: number;
  /** Contract length in months. */
  contractDurationMonths?: number;
  evaluation?: {
    technicalWeight?: number;
    financialWeight?: number;
    /** Minimum technical score required to reach financial evaluation. */
    technicalThreshold?: number;
  };
  submissionChannel?: 'portal' | 'email' | 'physical';
  eligibility: string[];
  mandatoryDocuments: string[];
  requiresConsortium: boolean;
  requiresSiteVisit: boolean;
  lotCount?: number;
}

export type BidUrgency = 'expired' | 'critical' | 'tight' | 'comfortable' | 'unknown';

export type BidVerdict = 'strong' | 'possible' | 'weak';

export interface BidBrief {
  headline: {
    title: string;
    buyer?: string;
    country?: string;
    source: string;
    url: string;
  };
  timeline: {
    publishedAt?: string;
    clarificationDeadlineAt?: string;
    deadlineAt?: string;
    daysRemaining?: number;
    urgency: BidUrgency;
  };
  commercials: {
    estimatedValue?: MonetaryAmount;
    bidSecurity?: MonetaryAmount;
    bidValidityDays?: number;
    contractDurationMonths?: number;
  };
  fit: {
    score: number;
    disciplines: CreativeDiscipline[];
    verdict: BidVerdict;
  };
  requirements: {
    eligibility: string[];
    mandatoryDocuments: string[];
    evaluation?: ExtractedFields['evaluation'];
  };
  submission: {
    channel?: ExtractedFields['submissionChannel'];
    lotCount?: number;
    requiresConsortium: boolean;
    requiresSiteVisit: boolean;
  };
  /** Things that should make a bid/no-bid decision cautious. */
  risks: string[];
  /** Concrete next actions, ordered by what blocks a submission first. */
  checklist: string[];
  /**
   * Fields the extractor could not establish. These are the parts of the brief a
   * human must read the tender document for - an empty value here is never a
   * claim that the requirement does not exist.
   */
  gaps: string[];
}

/** Options a source adapter receives for a single harvest. */
export interface HarvestOptions {
  /** Only consider notices published/updated at or after this ISO timestamp. */
  since: string;
  /** Hard cap on notices pulled from one source in one run. */
  limit: number;
  /** Per-source settings supplied by the operator, e.g. a feed URL or app name. */
  config?: Record<string, string>;
}

export interface SourceAdapter {
  key: string;
  label: string;
  /** Where the API contract this adapter implements is documented. */
  docs: string;
  /** Config keys the operator must supply before the adapter can run. */
  requiredConfig?: string[];
  fetchNotices(options: HarvestOptions): Promise<RawNotice[]>;
}
