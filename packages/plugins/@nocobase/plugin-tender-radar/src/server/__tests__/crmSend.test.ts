/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Repository } from '@nocobase/database';
import { describe, expect, it } from 'vitest';
import type { JsonValue } from '../../shared/types';
import { sendTenderToCrm } from '../crm/send';
import type { CrmTargetRow } from '../crm/target';

const NOW = new Date('2026-03-20T00:00:00.000Z');

type Row = Record<string, unknown> & { id: number };

function makeRepo(seed: Row[] = []) {
  const rows = [...seed];
  let sequence = rows.length;
  const wrap = (row: Row) => ({ toJSON: () => ({ ...row }), get: (key: string) => row[key] });

  return {
    rows,
    async findOne({ filter, filterByTk }: { filter?: Record<string, unknown>; filterByTk?: unknown } = {}) {
      const hit =
        filterByTk !== undefined
          ? rows.find((row) => String(row.id) === String(filterByTk))
          : rows.find((row) => Object.entries(filter ?? {}).every(([key, value]) => row[key] === value));
      return hit ? wrap(hit) : null;
    },
    async create({ values }: { values: Record<string, unknown> }) {
      const row = { ...values, id: ++sequence } as Row;
      rows.push(row);
      return wrap(row);
    },
    async update({ filterByTk, values }: { filterByTk: unknown; values: Record<string, unknown> }) {
      const row = rows.find((candidate) => String(candidate.id) === String(filterByTk));
      if (row) Object.assign(row, values);
      return [1];
    },
  };
}

const asRepository = (repo: ReturnType<typeof makeRepo>) => repo as unknown as Repository;

const tenderRow = (overrides: Partial<Row> = {}): Row => ({
  id: 1,
  dedupeKey: 'find-a-tender:ocds-1',
  title: 'Brand Identity Services',
  buyer: 'Arts Council',
  country: 'United Kingdom',
  url: 'https://example.org/notice/1',
  sourceName: 'Find a Tender (UK)',
  deadlineAt: '2026-04-03T14:30:00.000Z',
  estimatedValue: 250000,
  currency: 'GBP',
  relevanceScore: 85,
  disciplines: ['branding'],
  ...overrides,
});

const targetRow = (overrides: Partial<CrmTargetRow> = {}): Row =>
  ({
    id: 1,
    enabled: true,
    baseUrl: 'https://crm.example.com',
    tokenVariable: 'CRM_TOKEN',
    ...overrides,
  }) as Row;

interface Sent {
  target: CrmTargetRow;
  payload: Record<string, JsonValue>;
  token: string;
}

const harness = (options: { tenders?: Row[]; targets?: Row[]; variables?: Record<string, unknown> } = {}) => {
  const tenders = makeRepo(options.tenders ?? [tenderRow()]);
  const crmTargets = makeRepo(options.targets ?? [targetRow()]);
  const sent: Sent[] = [];

  const deps = {
    tenders: asRepository(tenders),
    crmTargets: asRepository(crmTargets),
    variables: options.variables ?? { CRM_TOKEN: 'secret-value' },
    now: NOW,
    send: async (target: CrmTargetRow, payload: Record<string, JsonValue>, token: string) => {
      sent.push({ target, payload, token });
      return { id: 'LEAD-1', response: { data: { id: 'LEAD-1' } } };
    },
  };

  return { tenders, crmTargets, sent, deps };
};

describe('sendTenderToCrm', () => {
  it('creates the lead and writes the id back onto the tender', async () => {
    const { tenders, deps } = harness();

    const outcome = await sendTenderToCrm(deps, { tenderId: 1 });

    expect(outcome).toMatchObject({ status: 'sent', crmLeadId: 'LEAD-1' });
    expect(tenders.rows[0]).toMatchObject({
      crmLeadId: 'LEAD-1',
      crmSyncStatus: 'sent',
      crmSyncedAt: NOW,
      crmError: null,
    });
  });

  it('sends the tender fields through the default map', async () => {
    const { sent, deps } = harness();

    await sendTenderToCrm(deps, { tenderId: 1 });

    expect(sent[0].payload).toMatchObject({
      title: 'Brand Identity Services',
      company: 'Arts Council',
      externalRef: 'find-a-tender:ocds-1',
      expectedCloseDate: '2026-04-03T14:30:00.000Z',
    });
  });

  it('applies a configured field map and default values', async () => {
    const { sent, deps } = harness({
      targets: [targetRow({ fieldMap: { title: 'subject' }, defaultValues: { owner: 'sales' } })],
    });

    await sendTenderToCrm(deps, { tenderId: 1 });

    expect(sent[0].payload).toEqual({ owner: 'sales', subject: 'Brand Identity Services' });
  });

  it('never puts the token in the payload', async () => {
    const { sent, deps } = harness();

    await sendTenderToCrm(deps, { tenderId: 1 });

    expect(JSON.stringify(sent[0].payload)).not.toContain('secret-value');
    expect(sent[0].token).toBe('secret-value');
  });

  it('skips a tender that already carries a lead id, rather than duplicating it', async () => {
    const { sent, deps } = harness({ tenders: [tenderRow({ crmLeadId: 'LEAD-EXISTING' })] });

    const outcome = await sendTenderToCrm(deps, { tenderId: 1 });

    expect(outcome).toMatchObject({ status: 'skipped', crmLeadId: 'LEAD-EXISTING' });
    expect(sent).toHaveLength(0);
  });

  it('resends when told to explicitly', async () => {
    const { sent, deps } = harness({ tenders: [tenderRow({ crmLeadId: 'LEAD-EXISTING' })] });

    const outcome = await sendTenderToCrm(deps, { tenderId: 1, resend: true });

    expect(outcome.status).toBe('sent');
    expect(sent).toHaveLength(1);
  });

  it('rejects an unknown tender with a 404', async () => {
    const { deps } = harness();

    await expect(sendTenderToCrm(deps, { tenderId: 999 })).rejects.toThrow('Tender not found');
  });

  it('rejects when no CRM target is enabled', async () => {
    const { deps } = harness({ targets: [targetRow({ enabled: false })] });

    await expect(sendTenderToCrm(deps, { tenderId: 1 })).rejects.toThrow('No enabled CRM target');
  });

  it('records a missing credential on the tender instead of throwing', async () => {
    const { tenders, deps } = harness({ variables: {} });

    const outcome = await sendTenderToCrm(deps, { tenderId: 1 });

    expect(outcome.status).toBe('failed');
    expect(outcome.reason).toContain('CRM_TOKEN');
    expect(tenders.rows[0]).toMatchObject({ crmSyncStatus: 'failed' });
    expect(tenders.rows[0].crmLeadId).toBeUndefined();
  });

  it('records a transport failure on the tender, so it is visible next to the record', async () => {
    const { tenders, deps } = harness();
    deps.send = async () => {
      throw new Error('HTTP 502 from the CRM');
    };

    const outcome = await sendTenderToCrm(deps, { tenderId: 1 });

    expect(outcome).toMatchObject({ status: 'failed' });
    expect(tenders.rows[0].crmError).toContain('HTTP 502');
  });

  it('treats a created lead with no returned id as sent, not failed', async () => {
    const { tenders, deps } = harness();
    deps.send = async () => ({ id: undefined, response: {} });

    const outcome = await sendTenderToCrm(deps, { tenderId: 1 });

    expect(outcome.status).toBe('sent');
    expect(tenders.rows[0].crmSyncStatus).toBe('sent');
  });

  it('clears a previous error when a retry succeeds', async () => {
    const { tenders, deps } = harness({ tenders: [tenderRow({ crmSyncStatus: 'failed', crmError: 'old failure' })] });

    await sendTenderToCrm(deps, { tenderId: 1 });

    expect(tenders.rows[0].crmError).toBeNull();
    expect(tenders.rows[0].crmSyncStatus).toBe('sent');
  });
});
