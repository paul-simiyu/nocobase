/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Context, Next } from '@nocobase/actions';
import { APPROVAL_ACTIONS, NAMESPACE } from '../../constants';
import type { ApprovalAction, ArtifactSnapshotEntry, RecordApprovalInput } from '../../types';
import { recordApproval, requestGateApproval } from '../delivery/approvals';
import type { DeliveryErrorCode } from '../delivery/errors';
import { DeliveryError } from '../delivery/errors';
import { completePhase } from '../delivery/phases';

const CLIENT_MESSAGES: Record<DeliveryErrorCode, string> = {
  'name-required': 'Type your full name to confirm this approval',
  'idempotency-required': 'This approval is missing its submission key, please reload and try again',
  'phase-not-found': 'This phase could not be found',
  'not-a-gate': 'This phase does not need your approval',
  'gate-needs-approval': 'This phase is waiting on a client approval',
  'already-closed': 'This phase has already been approved',
  'not-attached': 'This phase is not attached to a project',
  'supersedes-not-found': 'The approval this replaces could not be found',
};

function readSnapshot(value: unknown): ArtifactSnapshotEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries: ArtifactSnapshotEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const candidate = item as Partial<ArtifactSnapshotEntry>;
    if (typeof candidate.fileUuid !== 'string' || typeof candidate.versionLabel !== 'string') {
      continue;
    }
    entries.push({
      fileUuid: candidate.fileUuid,
      name: typeof candidate.name === 'string' ? candidate.name : candidate.fileUuid,
      versionLabel: candidate.versionLabel,
      versionHash: typeof candidate.versionHash === 'string' ? candidate.versionHash : undefined,
    });
  }
  return entries;
}

function readPhaseUuid(ctx: Context): string {
  const values = (ctx.action.params.values ?? {}) as Record<string, unknown>;
  const projectPhaseUuid = values.projectPhaseUuid;
  if (typeof projectPhaseUuid !== 'string' || !projectPhaseUuid) {
    ctx.throw(400, 'projectPhaseUuid is required');
  }
  return projectPhaseUuid as string;
}

/**
 * The client's decision at a gate: approve, approve with conditions, or request changes.
 *
 * The third action matters. Without it, clients approve in the UI and then send a "just one
 * small thing" email that lands nowhere.
 */
export async function submitApprovalAction(ctx: Context, next: Next) {
  const values = (ctx.action.params.values ?? {}) as Record<string, unknown>;
  const projectPhaseUuid = values.projectPhaseUuid;
  const action = values.action;

  if (typeof projectPhaseUuid !== 'string' || !projectPhaseUuid) {
    return ctx.throw(400, ctx.t('This phase could not be found', { ns: NAMESPACE }));
  }
  if (typeof action !== 'string' || !(APPROVAL_ACTIONS as readonly string[]).includes(action)) {
    return ctx.throw(400, ctx.t('Choose one of the available responses', { ns: NAMESPACE }));
  }
  // The deliberate friction step: an empty name blocks submission.
  const approvedByName = typeof values.approvedByName === 'string' ? values.approvedByName.trim() : '';
  if (!approvedByName) {
    return ctx.throw(400, ctx.t('Type your full name to confirm this approval', { ns: NAMESPACE }));
  }

  const input: RecordApprovalInput = {
    projectPhaseUuid,
    action: action as ApprovalAction,
    approvedByName,
    // TODO: derive this from the gate's own deliverables once they exist, rather than
    // trusting the caller. See docs/contract/events.md, "Known gaps".
    artifactSnapshot: readSnapshot(values.artifactSnapshot),
    idempotencyKey: typeof values.idempotencyKey === 'string' ? values.idempotencyKey : '',
    approvedByUserId: ctx.auth?.user?.id,
    conditionsText: typeof values.conditionsText === 'string' ? values.conditionsText : undefined,
    ipAddress: ctx.request.ip,
    portalVersion: typeof values.portalVersion === 'string' ? values.portalVersion : undefined,
    supersedesUuid: typeof values.supersedesUuid === 'string' ? values.supersedesUuid : undefined,
  };

  try {
    ctx.body = await recordApproval(ctx.app, input);
  } catch (err) {
    if (err instanceof DeliveryError) {
      return ctx.throw(400, ctx.t(CLIENT_MESSAGES[err.code], { ns: NAMESPACE }));
    }
    throw err;
  }
  await next();
}

/** Studio-side: put a gate up for client approval, which turns on its "awaiting you" slot. */
export async function requestApprovalAction(ctx: Context, next: Next) {
  const projectPhaseUuid = readPhaseUuid(ctx);
  try {
    ctx.body = await requestGateApproval(ctx.app, projectPhaseUuid);
  } catch (err) {
    if (err instanceof DeliveryError) {
      return ctx.throw(400, err.message);
    }
    throw err;
  }
  await next();
}

/** Studio-side: finish a phase of ordinary internal work and light up the next one. */
export async function completePhaseAction(ctx: Context, next: Next) {
  const projectPhaseUuid = readPhaseUuid(ctx);
  try {
    ctx.body = await completePhase(ctx.app, projectPhaseUuid);
  } catch (err) {
    if (err instanceof DeliveryError) {
      return ctx.throw(400, err.message);
    }
    throw err;
  }
  await next();
}
