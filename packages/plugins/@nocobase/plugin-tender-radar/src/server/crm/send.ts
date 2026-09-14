/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Repository } from '@nocobase/database';
import { applyFieldMap, buildCrmLead, type CrmLead, type TenderForCrm } from '../../shared/crmLead';
import type { JsonValue } from '../../shared/types';
import { createLead } from './client';
import { type CrmTargetRow, readFieldMap, resolveToken } from './target';

export interface SendOutcome {
  status: 'sent' | 'skipped' | 'failed';
  tenderId: string | number;
  crmLeadId?: string;
  /** Why a send was skipped or failed, for the caller to surface. */
  reason?: string;
}

export interface SendDeps {
  tenders: Repository;
  crmTargets: Repository;
  /** Environment variables, from which the API token is resolved by name. */
  variables: Record<string, unknown>;
  now?: Date;
  /** Injected in tests so the send path runs without network I/O. */
  send?: typeof createLead;
}

/** Raised for caller or configuration errors the HTTP layer turns into a 4xx. */
export class CrmSendError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'CrmSendError';
    this.status = status;
  }
}

const toTenderForCrm = (record: Record<string, unknown>): TenderForCrm => ({
  dedupeKey: String(record.dedupeKey ?? ''),
  title: String(record.title ?? ''),
  buyer: typeof record.buyer === 'string' ? record.buyer : undefined,
  country: typeof record.country === 'string' ? record.country : undefined,
  url: String(record.url ?? ''),
  sourceName: typeof record.sourceName === 'string' ? record.sourceName : undefined,
  deadlineAt:
    record.deadlineAt instanceof Date || typeof record.deadlineAt === 'string' ? record.deadlineAt : undefined,
  estimatedValue: typeof record.estimatedValue === 'number' ? record.estimatedValue : undefined,
  currency: typeof record.currency === 'string' ? record.currency : undefined,
  relevanceScore: typeof record.relevanceScore === 'number' ? record.relevanceScore : undefined,
  disciplines: record.disciplines,
  bidBrief: record.bidBrief,
});

const readDefaults = (target: CrmTargetRow): Record<string, JsonValue> => {
  const values = target.defaultValues;
  return values && typeof values === 'object' && !Array.isArray(values) ? (values as Record<string, JsonValue>) : {};
};

/**
 * Sends one tender to the configured CRM as a lead.
 *
 * Idempotent by default: a tender that already carries a `crmLeadId` is skipped
 * rather than duplicated, because a lead the sales team has since edited must
 * not be replaced by a fresh copy. Pass `resend` to override deliberately.
 *
 * Caller and configuration errors throw; a failed CRM call is recorded on the
 * tender instead, so the failure is visible next to the record it concerns.
 */
export async function sendTenderToCrm(
  deps: SendDeps,
  options: { tenderId: string | number; resend?: boolean },
): Promise<SendOutcome> {
  const { tenderId, resend = false } = options;
  const now = deps.now ?? new Date();

  const record = await deps.tenders.findOne({ filterByTk: tenderId });
  if (!record) {
    throw new CrmSendError('Tender not found.', 404);
  }

  const existingLeadId = record.get('crmLeadId');
  if (typeof existingLeadId === 'string' && existingLeadId !== '' && !resend) {
    return { status: 'skipped', tenderId, crmLeadId: existingLeadId, reason: 'Already sent to the CRM.' };
  }

  const target = (await deps.crmTargets.findOne({ filter: { enabled: true } }))?.toJSON() as CrmTargetRow | undefined;
  if (!target) {
    throw new CrmSendError('No enabled CRM target is configured.', 409);
  }

  const tender = toTenderForCrm(record.toJSON() as Record<string, unknown>);
  const lead: CrmLead = buildCrmLead(tender, 'Tender radar');
  const payload = applyFieldMap(lead, readFieldMap(target), readDefaults(target));

  try {
    const token = resolveToken(target, deps.variables);
    const { id } = await (deps.send ?? createLead)(target, payload, token);

    await deps.tenders.update({
      filterByTk: tenderId,
      values: { crmLeadId: id ?? '', crmSyncedAt: now, crmSyncStatus: 'sent', crmError: null },
    });

    return { status: 'sent', tenderId, crmLeadId: id };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await deps.tenders.update({
      filterByTk: tenderId,
      values: { crmSyncStatus: 'failed', crmError: reason },
    });
    return { status: 'failed', tenderId, reason };
  }
}
