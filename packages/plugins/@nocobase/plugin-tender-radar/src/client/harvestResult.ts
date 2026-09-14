/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

export interface HarvestResult {
  sources: number;
  created: number;
  updated: number;
  skipped: number;
  failed: { sourceKey: string; error?: string }[];
}

const asNumber = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

/**
 * Reads the harvest response defensively.
 *
 * NocoBase wraps an action body as `{ data: <body> }`, so the counters sit one
 * level deeper than the action returns them. Anything missing reads as zero
 * rather than rendering "undefined" into a success message.
 */
export function readHarvestResult(payload: unknown): HarvestResult {
  const envelope = asRecord(payload) ?? {};
  const body = asRecord(envelope.data) ?? envelope;

  const failed = Array.isArray(body.failed)
    ? body.failed.flatMap((entry) => {
        const record = asRecord(entry);
        return record && typeof record.sourceKey === 'string'
          ? [{ sourceKey: record.sourceKey, error: typeof record.error === 'string' ? record.error : undefined }]
          : [];
      })
    : [];

  return {
    sources: asNumber(body.sources),
    created: asNumber(body.created),
    updated: asNumber(body.updated),
    skipped: asNumber(body.skipped),
    failed,
  };
}
