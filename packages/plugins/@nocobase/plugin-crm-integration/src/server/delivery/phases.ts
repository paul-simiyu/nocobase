/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Application } from '@nocobase/server';
import type { Transaction, Transactionable } from '@nocobase/database';
import { COLLECTION, WORKSPACE_EVENT } from '../../constants';
import type { WorkspaceProjectCompletedPayload } from '../../types';
import { writeOutboxEvent } from '../bus/outbox';
import { withTransaction } from '../utils';
import type { StageSyncResult } from './advancement';
import { syncDealStage } from './advancement';
import { DeliveryError } from './errors';

export interface ProjectRef {
  id: number;
  uuid: string;
  dealUuid: string;
  organisationUuid: string;
}

export interface PhaseTransition {
  nextPhaseName: string | null;
  projectCompleted: boolean;
}

function phaseName(record: { get(key: string): unknown } | null): string | null {
  const phase = record?.get('phase') as { name?: string } | undefined;
  return phase?.name ?? null;
}

/**
 * Close a phase and light up the one behind it.
 *
 * Shared by the two ways a phase ends: a client approving a gate, and the studio finishing
 * ordinary work. When there is no phase behind it, the project itself is done — which is not
 * the same as the deal being closed out. That stays a human action in the CRM, because it is
 * where invoicing, retrospectives and the case study request hang.
 */
export async function closePhaseAndActivateNext(
  app: Application,
  params: { project: ProjectRef; projectPhaseId: number; closedPhaseName: string; at: Date },
  transaction: Transaction,
): Promise<PhaseTransition> {
  const phaseRepository = app.db.getRepository(COLLECTION.projectPhases);
  const milestoneRepository = app.db.getRepository(COLLECTION.milestones);

  await phaseRepository.update({
    filterByTk: params.projectPhaseId,
    values: { status: 'complete', completedAt: params.at, awaitingClient: false },
    transaction,
  });
  const milestone = await milestoneRepository.findOne({
    filter: { projectPhaseId: params.projectPhaseId },
    transaction,
  });
  if (milestone) {
    await milestoneRepository.update({
      filterByTk: milestone.get('id') as number,
      values: { state: 'complete' },
      transaction,
    });
  }

  const nextPhase = await phaseRepository.findOne({
    filter: { projectId: params.project.id, status: 'upcoming' },
    sort: ['position'],
    appends: ['phase'],
    transaction,
  });

  if (nextPhase) {
    await phaseRepository.update({
      filterByTk: nextPhase.get('id') as number,
      values: { status: 'in_progress', startedAt: params.at },
      transaction,
    });
    const nextMilestone = await milestoneRepository.findOne({
      filter: { projectPhaseId: nextPhase.get('id') as number },
      transaction,
    });
    if (nextMilestone) {
      await milestoneRepository.update({
        filterByTk: nextMilestone.get('id') as number,
        values: { state: 'in_progress' },
        transaction,
      });
    }
    return { nextPhaseName: phaseName(nextPhase), projectCompleted: false };
  }

  await app.db.getRepository(COLLECTION.projects).update({
    filterByTk: params.project.id,
    values: { status: 'complete', completedAt: params.at },
    transaction,
  });
  const payload: WorkspaceProjectCompletedPayload = {
    projectUuid: params.project.uuid,
    dealUuid: params.project.dealUuid,
    organisationUuid: params.project.organisationUuid,
    finalPhaseName: params.closedPhaseName,
    completedAt: params.at.toISOString(),
  };
  await writeOutboxEvent(
    app,
    {
      name: WORKSPACE_EVENT.projectCompleted,
      payload: payload as unknown as Record<string, unknown>,
      origin: 'user',
    },
    { transaction },
  );
  return { nextPhaseName: null, projectCompleted: true };
}

export interface CompletePhaseResult extends PhaseTransition {
  stage: StageSyncResult;
}

/**
 * Finish an ordinary phase of internal work. A gate is refused here: it closes only when the
 * client acts on it.
 */
export async function completePhase(
  app: Application,
  projectPhaseUuid: string,
  options?: Transactionable,
): Promise<CompletePhaseResult> {
  return withTransaction(app.db, options, async (transaction) => {
    const projectPhase = await app.db.getRepository(COLLECTION.projectPhases).findOne({
      filter: { uuid: projectPhaseUuid },
      appends: ['phase', 'project'],
      transaction,
    });
    if (!projectPhase) {
      throw new DeliveryError(`no phase found for "${projectPhaseUuid}"`, 'phase-not-found');
    }
    const phase = projectPhase.get('phase') as { isGate?: boolean; name?: string } | undefined;
    const project = projectPhase.get('project') as Partial<ProjectRef> | undefined;
    if (phase?.isGate) {
      throw new DeliveryError(`phase "${phase.name}" is a gate and needs client approval`, 'gate-needs-approval');
    }
    if (projectPhase.get('status') === 'complete') {
      throw new DeliveryError(`phase "${phase?.name}" is already closed`, 'already-closed');
    }
    if (!project?.id || !project.uuid) {
      throw new DeliveryError('phase is not attached to a project', 'not-attached');
    }

    const at = new Date();
    const transition = await closePhaseAndActivateNext(
      app,
      {
        project: project as ProjectRef,
        projectPhaseId: projectPhase.get('id') as number,
        closedPhaseName: phase?.name ?? '',
        at,
      },
      transaction,
    );

    const stage = await syncDealStage(
      app,
      {
        dealUuid: project.dealUuid as string,
        projectUuid: project.uuid,
        phaseName: transition.nextPhaseName ?? (phase?.name as string),
        reason: `${phase?.name} completed`,
      },
      { transaction },
    );

    return { ...transition, stage };
  });
}
