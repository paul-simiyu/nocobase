/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Application } from '@nocobase/server';
import type { Transactionable } from '@nocobase/database';
import { COLLECTION, DEFAULTS, WORKSPACE_EVENT } from '../../constants';
import type {
  ApprovalAction,
  ArtifactSnapshotEntry,
  RecordApprovalInput,
  WorkspaceMilestoneApprovedPayload,
} from '../../types';
import { writeOutboxEvent } from '../bus/outbox';
import { withTransaction } from '../utils';
import type { StageSyncResult } from './advancement';
import { syncDealStage } from './advancement';
import { DeliveryError } from './errors';
import type { ProjectRef } from './phases';
import { closePhaseAndActivateNext } from './phases';

export interface ApprovalResult {
  uuid: string;
  action: ApprovalAction;
  duplicate: boolean;
  phaseClosed: boolean;
  nextPhaseName: string | null;
  projectCompleted: boolean;
  revisionRound: number;
  stage: StageSyncResult | null;
}

function closesGate(action: ApprovalAction): boolean {
  return action === 'approve' || action === 'approve_with_conditions';
}

function normaliseSnapshot(entries: ArtifactSnapshotEntry[] | undefined): ArtifactSnapshotEntry[] {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.map((entry) => ({
    fileUuid: entry.fileUuid,
    name: entry.name,
    versionLabel: entry.versionLabel,
    versionHash: entry.versionHash,
  }));
}

/**
 * Record a client's decision at a gate.
 *
 * An approval is a signed delivery receipt, not a button click: a named person, against a
 * specific set of file versions, at a specific time. The record is immutable — a change of
 * mind is a new approval that references this one through `supersedesUuid`, never an edit.
 */
export async function recordApproval(
  app: Application,
  input: RecordApprovalInput,
  options?: Transactionable,
): Promise<ApprovalResult> {
  const approvedByName = (input.approvedByName ?? '').trim();
  if (!approvedByName) {
    throw new DeliveryError('approvedByName is required', 'name-required');
  }
  if (!input.idempotencyKey) {
    throw new DeliveryError('idempotencyKey is required', 'idempotency-required');
  }

  return withTransaction(app.db, options, async (transaction) => {
    const approvalRepository = app.db.getRepository(COLLECTION.approvals);

    // A double-click must not double-fire.
    const duplicate = await approvalRepository.findOne({
      filter: { idempotencyKey: input.idempotencyKey },
      transaction,
    });
    if (duplicate) {
      const action = duplicate.get('action') as ApprovalAction;
      return {
        uuid: duplicate.get('uuid') as string,
        action,
        duplicate: true,
        phaseClosed: closesGate(action),
        nextPhaseName: null,
        projectCompleted: false,
        revisionRound: duplicate.get('revisionRound') as number,
        stage: null,
      };
    }

    const phaseRepository = app.db.getRepository(COLLECTION.projectPhases);
    const projectPhase = await phaseRepository.findOne({
      filter: { uuid: input.projectPhaseUuid },
      appends: ['phase', 'project'],
      transaction,
    });
    if (!projectPhase) {
      throw new DeliveryError(`no phase found for "${input.projectPhaseUuid}"`, 'phase-not-found');
    }

    const phase = projectPhase.get('phase') as { isGate?: boolean; name?: string } | undefined;
    const project = projectPhase.get('project') as Partial<ProjectRef> | undefined;
    if (!phase?.isGate) {
      throw new DeliveryError(`phase "${phase?.name ?? input.projectPhaseUuid}" is not a gate`, 'not-a-gate');
    }
    if (projectPhase.get('status') === 'complete') {
      throw new DeliveryError(`phase "${phase.name}" is already closed`, 'already-closed');
    }
    if (!project?.id || !project.uuid) {
      throw new DeliveryError('phase is not attached to a project', 'not-attached');
    }

    const projectPhaseId = projectPhase.get('id') as number;
    const revisionRound = (projectPhase.get('revisionRound') as number) ?? 1;
    const approvedAt = new Date();

    let supersedesId: number | null = null;
    if (input.supersedesUuid) {
      const superseded = await approvalRepository.findOne({
        filter: { uuid: input.supersedesUuid },
        transaction,
      });
      if (!superseded) {
        throw new DeliveryError(`no approval found for "${input.supersedesUuid}"`, 'supersedes-not-found');
      }
      supersedesId = superseded.get('id') as number;
    }

    const snapshot = normaliseSnapshot(input.artifactSnapshot);
    const approval = await approvalRepository.create({
      values: {
        projectPhaseId,
        approvedByUserId: input.approvedByUserId ?? null,
        approvedByName,
        approvedAt,
        action: input.action,
        conditionsText: input.conditionsText ?? null,
        revisionRound,
        artifactSnapshot: snapshot,
        ipAddress: input.ipAddress ?? null,
        portalVersion: input.portalVersion ?? DEFAULTS.portalVersion,
        idempotencyKey: input.idempotencyKey,
        supersedesId,
      },
      transaction,
    });
    const approvalUuid = approval.get('uuid') as string;

    const milestoneRepository = app.db.getRepository(COLLECTION.milestones);
    const milestone = await milestoneRepository.findOne({ filter: { projectPhaseId }, transaction });
    const milestoneName = (milestone?.get('name') as string) ?? (phase.name as string);

    if (!closesGate(input.action)) {
      // The phase stays open and the ball goes back to the studio; the counter moves on.
      await phaseRepository.update({
        filterByTk: projectPhaseId,
        values: { awaitingClient: false, revisionRound: revisionRound + 1 },
        transaction,
      });
      if (milestone) {
        await milestoneRepository.update({
          filterByTk: milestone.get('id') as number,
          values: { state: 'in_progress' },
          transaction,
        });
      }
      return {
        uuid: approvalUuid,
        action: input.action,
        duplicate: false,
        phaseClosed: false,
        nextPhaseName: null,
        projectCompleted: false,
        revisionRound: revisionRound + 1,
        stage: null,
      };
    }

    const transition = await closePhaseAndActivateNext(
      app,
      {
        project: project as ProjectRef,
        projectPhaseId,
        closedPhaseName: phase.name as string,
        at: approvedAt,
      },
      transaction,
    );

    const payload: WorkspaceMilestoneApprovedPayload = {
      projectUuid: project.uuid,
      dealUuid: project.dealUuid as string,
      organisationUuid: project.organisationUuid as string,
      milestoneName,
      phaseName: phase.name as string,
      approvalUuid,
      action: input.action,
      approvedByName,
      approvedAt: approvedAt.toISOString(),
      conditionsText: input.conditionsText,
      artifactSnapshot: snapshot,
    };
    await writeOutboxEvent(
      app,
      {
        name: WORKSPACE_EVENT.milestoneApproved,
        payload: payload as unknown as Record<string, unknown>,
        origin: 'user',
      },
      { transaction },
    );

    const stage = await syncDealStage(
      app,
      {
        dealUuid: project.dealUuid as string,
        projectUuid: project.uuid,
        phaseName: transition.nextPhaseName ?? (phase.name as string),
        reason: `${milestoneName} approved by ${approvedByName}`,
      },
      { transaction },
    );

    return {
      uuid: approvalUuid,
      action: input.action,
      duplicate: false,
      phaseClosed: true,
      nextPhaseName: transition.nextPhaseName,
      projectCompleted: transition.projectCompleted,
      revisionRound,
      stage,
    };
  });
}

/**
 * Put a gate up for client approval: the phase's "awaiting you" slot turns on and its
 * milestone enters `awaiting_approval`.
 */
export async function requestGateApproval(
  app: Application,
  projectPhaseUuid: string,
  options?: Transactionable,
): Promise<{ projectPhaseUuid: string; milestoneName: string | null }> {
  return withTransaction(app.db, options, async (transaction) => {
    const phaseRepository = app.db.getRepository(COLLECTION.projectPhases);
    const projectPhase = await phaseRepository.findOne({
      filter: { uuid: projectPhaseUuid },
      appends: ['phase'],
      transaction,
    });
    if (!projectPhase) {
      throw new DeliveryError(`no phase found for "${projectPhaseUuid}"`, 'phase-not-found');
    }
    const phase = projectPhase.get('phase') as { isGate?: boolean; name?: string } | undefined;
    if (!phase?.isGate) {
      throw new DeliveryError(`phase "${phase?.name ?? projectPhaseUuid}" is not a gate`, 'not-a-gate');
    }
    if (projectPhase.get('status') === 'complete') {
      throw new DeliveryError(`phase "${phase.name}" is already closed`, 'already-closed');
    }

    await phaseRepository.update({
      filterByTk: projectPhase.get('id') as number,
      values: { awaitingClient: true, status: 'in_progress' },
      transaction,
    });

    const milestoneRepository = app.db.getRepository(COLLECTION.milestones);
    const milestone = await milestoneRepository.findOne({
      filter: { projectPhaseId: projectPhase.get('id') as number },
      transaction,
    });
    if (milestone) {
      await milestoneRepository.update({
        filterByTk: milestone.get('id') as number,
        values: { state: 'awaiting_approval' },
        transaction,
      });
    }

    return {
      projectPhaseUuid,
      milestoneName: (milestone?.get('name') as string) ?? null,
    };
  });
}
