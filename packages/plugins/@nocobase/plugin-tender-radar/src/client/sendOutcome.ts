/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

export type SendStatus = 'sent' | 'skipped' | 'failed';

export interface SendOutcomeView {
  status: SendStatus;
  crmLeadId?: string;
  reason?: string;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const STATUSES: SendStatus[] = ['sent', 'skipped', 'failed'];

/**
 * Reads the send response out of the NocoBase `{ data: <body> }` envelope.
 *
 * An unrecognised body reads as `failed` rather than `sent`: telling someone
 * their tender reached the CRM when the response was unreadable is the one
 * mistake here that costs a bid.
 */
export function readSendOutcome(payload: unknown): SendOutcomeView {
  const envelope = asRecord(payload) ?? {};
  const body = asRecord(envelope.data) ?? envelope;

  const status = STATUSES.find((candidate) => candidate === body.status);
  if (!status) {
    return { status: 'failed', reason: 'The CRM response could not be read.' };
  }

  return {
    status,
    crmLeadId: typeof body.crmLeadId === 'string' && body.crmLeadId !== '' ? body.crmLeadId : undefined,
    reason: typeof body.reason === 'string' && body.reason !== '' ? body.reason : undefined,
  };
}
