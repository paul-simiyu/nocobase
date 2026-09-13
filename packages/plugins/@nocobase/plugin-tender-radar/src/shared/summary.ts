/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { daysBetween } from './dates';
import type { BidBrief, BidUrgency, BidVerdict, ExtractedFields, MonetaryAmount, RelevanceResult } from './types';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "3 Apr 2026", or "3 Apr 2026 14:30 UTC" when a time of day was captured. */
export function formatDate(iso?: string): string {
  if (!iso) return 'not stated';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'not stated';
  const base = `${date.getUTCDate()} ${MONTH_LABELS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  if (hours === 0 && minutes === 0) return base;
  return `${base} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} UTC`;
}

export function formatAmount(amount?: MonetaryAmount): string {
  if (!amount) return 'not stated';
  if (amount.isPercentage) return `${amount.value}% of bid price`;
  const formatted = amount.value.toLocaleString('en-US');
  return amount.currency ? `${amount.currency} ${formatted}` : formatted;
}

const URGENCY_DAYS = { critical: 7, tight: 14 };

export function classifyUrgency(daysRemaining?: number): BidUrgency {
  if (daysRemaining === undefined) return 'unknown';
  if (daysRemaining < 0) return 'expired';
  if (daysRemaining <= URGENCY_DAYS.critical) return 'critical';
  if (daysRemaining <= URGENCY_DAYS.tight) return 'tight';
  return 'comfortable';
}

const VERDICT_SCORES = { strong: 70, possible: 40 };

export function classifyVerdict(score: number): BidVerdict {
  if (score >= VERDICT_SCORES.strong) return 'strong';
  if (score >= VERDICT_SCORES.possible) return 'possible';
  return 'weak';
}

export interface BriefInput {
  title: string;
  buyer?: string;
  country?: string;
  url: string;
  sourceLabel: string;
  publishedAt?: string;
  relevance: RelevanceResult;
  fields: ExtractedFields;
  /** Injected so briefs are reproducible in tests and stable within one harvest. */
  now?: Date;
}

const hasPassed = (iso: string | undefined, now: Date): boolean =>
  iso !== undefined && new Date(iso).getTime() < now.getTime();

function buildRisks(
  fields: ExtractedFields,
  relevance: RelevanceResult,
  urgency: BidUrgency,
  now: Date,
  daysRemaining?: number,
): string[] {
  const risks: string[] = [];

  if (urgency === 'expired') {
    risks.push('The submission deadline has already passed.');
  } else if (urgency === 'critical') {
    risks.push(`Only ${daysRemaining} day(s) to the deadline - confirm studio capacity before committing.`);
  } else if (urgency === 'unknown') {
    risks.push('No submission deadline could be read from the notice - verify it in the tender document.');
  }

  if (fields.bidSecurity) {
    risks.push(
      `A bid security of ${formatAmount(
        fields.bidSecurity,
      )} is required - bank guarantees typically take 5-10 working days to arrange.`,
    );
  }
  if (fields.requiresSiteVisit) {
    risks.push(
      'A site visit or pre-bid meeting is marked mandatory - non-attendance is normally an automatic disqualification.',
    );
  }
  if (hasPassed(fields.clarificationDeadlineAt, now)) {
    risks.push(
      `The clarification window closed on ${formatDate(
        fields.clarificationDeadlineAt,
      )} - no further questions can be raised.`,
    );
  }
  if (hasPassed(fields.siteVisitAt, now)) {
    risks.push(
      `The site visit on ${formatDate(fields.siteVisitAt)} has already taken place${
        fields.requiresSiteVisit ? ' and was mandatory - eligibility is likely lost' : ''
      }.`,
    );
  }
  if (fields.requiresConsortium) {
    risks.push(
      'The notice references a joint venture or consortium - a local partner may be a condition of eligibility.',
    );
  }
  if (fields.evaluation?.technicalThreshold !== undefined) {
    risks.push(
      `A technical pass mark of ${fields.evaluation.technicalThreshold}% applies - financial bids below it are never opened.`,
    );
  }
  if (fields.bidValidityDays !== undefined && fields.bidValidityDays >= 90) {
    risks.push(`Bids stay valid for ${fields.bidValidityDays} days, tying up bond capacity for that period.`);
  }
  if (fields.lotCount !== undefined && fields.lotCount > 1) {
    risks.push(
      `The tender is split into ${fields.lotCount} lots - decide which lots to bid and whether partial awards are acceptable.`,
    );
  }
  if (relevance.disqualifyingTerms.length) {
    risks.push(
      `The notice also mentions ${relevance.disqualifyingTerms.join(
        ', ',
      )} - confirm creative services are the main deliverable and not a minor line item.`,
    );
  }
  return risks;
}

/** Only milestones that are still ahead are actionable; past ones are raised as risks. */
function buildChecklist(fields: ExtractedFields, now: Date): string[] {
  const checklist: string[] = [];

  if (fields.clarificationDeadlineAt && !hasPassed(fields.clarificationDeadlineAt, now)) {
    checklist.push(`Raise clarification questions before ${formatDate(fields.clarificationDeadlineAt)}.`);
  }
  if (fields.siteVisitAt && !hasPassed(fields.siteVisitAt, now)) {
    checklist.push(`Attend the site visit / pre-bid meeting on ${formatDate(fields.siteVisitAt)}.`);
  }
  if (fields.bidSecurity) {
    checklist.push(`Instruct the bank for a bid security of ${formatAmount(fields.bidSecurity)}.`);
  }
  if (fields.mandatoryDocuments.length) {
    checklist.push(`Assemble the ${fields.mandatoryDocuments.length} mandatory document(s) listed in the notice.`);
  }
  if (fields.eligibility.length) {
    checklist.push(`Check the ${fields.eligibility.length} eligibility condition(s) against current company records.`);
  }
  if (fields.evaluation?.technicalWeight !== undefined) {
    const technical = fields.evaluation.technicalWeight;
    const financial = fields.evaluation.financialWeight ?? 100 - technical;
    checklist.push(`Shape the proposal to the ${technical}/${financial} technical-to-financial split.`);
  }
  if (fields.submissionChannel === 'portal') {
    checklist.push('Confirm the portal account is registered and active well ahead of the deadline.');
  }
  if (fields.submissionChannel === 'physical') {
    checklist.push('Plan for printing, sealing and physical delivery of the bid.');
  }
  if (fields.deadlineAt && !hasPassed(fields.deadlineAt, now)) {
    checklist.push(`Submit by ${formatDate(fields.deadlineAt)}.`);
  }
  return checklist;
}

function buildGaps(fields: ExtractedFields): string[] {
  const gaps: string[] = [];
  if (!fields.deadlineAt) gaps.push('submission deadline');
  if (!fields.estimatedValue) gaps.push('estimated contract value');
  if (!fields.bidSecurity) gaps.push('bid security requirement');
  if (!fields.evaluation) gaps.push('evaluation criteria and weighting');
  if (!fields.eligibility.length) gaps.push('eligibility conditions');
  if (!fields.mandatoryDocuments.length) gaps.push('mandatory document list');
  if (!fields.submissionChannel) gaps.push('submission channel');
  if (fields.contractDurationMonths === undefined) gaps.push('contract duration');
  return gaps;
}

/**
 * Assembles the bid brief for a single notice.
 *
 * Everything here is derived deterministically from `fields` and `relevance`;
 * nothing is inferred beyond what the notice actually said. Fields the extractor
 * could not establish are reported in `gaps` rather than left silently blank.
 */
export function buildBidBrief(input: BriefInput): BidBrief {
  const { fields, relevance } = input;
  const now = input.now ?? new Date();

  const daysRemaining = fields.deadlineAt ? daysBetween(now, new Date(fields.deadlineAt)) : undefined;
  const urgency = classifyUrgency(daysRemaining);

  return {
    headline: {
      title: input.title,
      buyer: input.buyer,
      country: input.country,
      source: input.sourceLabel,
      url: input.url,
    },
    timeline: {
      publishedAt: input.publishedAt,
      clarificationDeadlineAt: fields.clarificationDeadlineAt,
      deadlineAt: fields.deadlineAt,
      daysRemaining,
      urgency,
    },
    commercials: {
      estimatedValue: fields.estimatedValue,
      bidSecurity: fields.bidSecurity,
      bidValidityDays: fields.bidValidityDays,
      contractDurationMonths: fields.contractDurationMonths,
    },
    fit: {
      score: relevance.score,
      disciplines: relevance.disciplines,
      verdict: classifyVerdict(relevance.score),
    },
    requirements: {
      eligibility: fields.eligibility,
      mandatoryDocuments: fields.mandatoryDocuments,
      evaluation: fields.evaluation,
    },
    submission: {
      channel: fields.submissionChannel,
      lotCount: fields.lotCount,
      requiresConsortium: fields.requiresConsortium,
      requiresSiteVisit: fields.requiresSiteVisit,
    },
    risks: buildRisks(fields, relevance, urgency, now, daysRemaining),
    checklist: buildChecklist(fields, now),
    gaps: buildGaps(fields),
  };
}

const bullet = (items: string[], empty: string): string =>
  items.length ? items.map((item) => `- ${item}`).join('\n') : `- ${empty}`;

/** Renders a brief as markdown, for email, chat or a workflow notification body. */
export function briefToMarkdown(brief: BidBrief): string {
  const { headline, timeline, commercials, fit, requirements, submission } = brief;
  const remaining =
    timeline.daysRemaining === undefined
      ? 'unknown'
      : timeline.daysRemaining < 0
        ? `${Math.abs(timeline.daysRemaining)} day(s) ago`
        : `${timeline.daysRemaining} day(s) left`;

  const evaluation = requirements.evaluation
    ? `${requirements.evaluation.technicalWeight ?? '?'}% technical / ${
        requirements.evaluation.financialWeight ?? '?'
      }% financial` +
      (requirements.evaluation.technicalThreshold !== undefined
        ? `, pass mark ${requirements.evaluation.technicalThreshold}%`
        : '')
    : 'not stated';

  return [
    `# ${headline.title}`,
    '',
    `**Buyer:** ${headline.buyer ?? 'not stated'}  `,
    `**Country:** ${headline.country ?? 'not stated'}  `,
    `**Source:** ${headline.source}  `,
    `**Notice:** ${headline.url}`,
    '',
    `## Fit: ${fit.verdict} (${fit.score}/100)`,
    `Disciplines: ${fit.disciplines.length ? fit.disciplines.join(', ') : 'none detected'}`,
    '',
    '## Dates',
    `- Published: ${formatDate(timeline.publishedAt)}`,
    `- Clarifications close: ${formatDate(timeline.clarificationDeadlineAt)}`,
    `- **Submission deadline: ${formatDate(timeline.deadlineAt)}** (${remaining}, ${timeline.urgency})`,
    '',
    '## Commercials',
    `- Estimated value: ${formatAmount(commercials.estimatedValue)}`,
    `- Bid security: ${formatAmount(commercials.bidSecurity)}`,
    `- Bid validity: ${
      commercials.bidValidityDays !== undefined ? `${commercials.bidValidityDays} days` : 'not stated'
    }`,
    `- Contract duration: ${
      commercials.contractDurationMonths !== undefined ? `${commercials.contractDurationMonths} months` : 'not stated'
    }`,
    `- Evaluation: ${evaluation}`,
    '',
    '## Submission',
    `- Channel: ${submission.channel ?? 'not stated'}`,
    `- Lots: ${submission.lotCount ?? 1}`,
    `- Consortium referenced: ${submission.requiresConsortium ? 'yes' : 'no'}`,
    `- Mandatory site visit: ${submission.requiresSiteVisit ? 'yes' : 'no'}`,
    '',
    '## Eligibility',
    bullet(requirements.eligibility, 'Not stated in the notice - read the tender document.'),
    '',
    '## Mandatory documents',
    bullet(requirements.mandatoryDocuments, 'Not stated in the notice - read the tender document.'),
    '',
    '## Risks',
    bullet(brief.risks, 'None flagged.'),
    '',
    '## Checklist',
    bullet(brief.checklist, 'Nothing actionable detected.'),
    '',
    '## Not found in the notice',
    bullet(brief.gaps, 'Everything the extractor looks for was found.'),
    '',
    '_Fields above are extracted by rule, not read by a human. Always confirm against the official tender document before bidding._',
  ].join('\n');
}
