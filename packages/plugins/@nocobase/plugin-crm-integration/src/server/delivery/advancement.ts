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
import { COLLECTION, CRM_STAGES, WORKSPACE_EVENT } from '../../constants';
import type { CrmStage, WorkspaceProjectStageReachedPayload } from '../../types';
import { writeOutboxEvent } from '../bus/outbox';
import { withTransaction } from '../utils';

export type StageSyncOutcome = 'emitted' | 'unchanged' | 'not-forward' | 'manual-override' | 'no-projects';

export interface StageSyncResult {
  outcome: StageSyncOutcome;
  stage: CrmStage | null;
  previousStage: CrmStage | null;
}

export interface StageSyncInput {
  dealUuid: string;
  /** The project and phase that triggered the move, for the CRM's activity note. */
  projectUuid: string;
  phaseName: string;
  reason: string;
  depth?: number;
}

export function stageIndex(stage: CrmStage): number {
  return CRM_STAGES.indexOf(stage);
}

function isStage(value: unknown): value is CrmStage {
  return typeof value === 'string' && (CRM_STAGES as readonly string[]).includes(value);
}

/**
 * The stage a single project currently implies: the stage of its earliest unfinished phase,
 * or the stage of its last phase once every phase is done.
 */
async function projectStage(app: Application, projectId: number, options: Transactionable): Promise<CrmStage | null> {
  const phases = await app.db.getRepository(COLLECTION.projectPhases).find({
    filter: { projectId },
    sort: ['position'],
    appends: ['phase'],
    transaction: options.transaction,
  });
  if (!phases.length) {
    return null;
  }
  const current = phases.find((phase) => phase.get('status') !== 'complete') ?? phases[phases.length - 1];
  const phase = current.get('phase') as { crmStage?: string } | undefined;
  return isStage(phase?.crmStage) ? phase.crmStage : null;
}

/**
 * The stage a deal should sit at: the *earliest* stage across all of its tracks.
 *
 * Least-advanced wins. Otherwise a finished Visual Identity track drags the deal to
 * Production while the Web track is still in Design.
 */
export async function computeDealStage(
  app: Application,
  dealUuid: string,
  options?: Transactionable,
): Promise<CrmStage | null> {
  const projects = await app.db.getRepository(COLLECTION.projects).find({
    filter: { dealUuid },
    transaction: options?.transaction,
  });

  let earliest: CrmStage | null = null;
  for (const project of projects) {
    const stage = await projectStage(app, project.get('id') as number, { transaction: options?.transaction });
    if (!stage) {
      continue;
    }
    if (earliest === null || stageIndex(stage) < stageIndex(earliest)) {
      earliest = stage;
    }
  }
  return earliest;
}

/**
 * Move the deal forward if — and only if — every guardrail allows it.
 *
 * A ratchet: it turns one way only. Approvals click it forward; nothing clicks it back
 * automatically, and a stage a person set by hand is left alone with a conflict logged for
 * review rather than silently overwritten.
 */
export async function syncDealStage(
  app: Application,
  input: StageSyncInput,
  options?: Transactionable,
): Promise<StageSyncResult> {
  return withTransaction(app.db, options, async (transaction) => {
    const dealRepository = app.db.getRepository(COLLECTION.deals);
    const deal = await dealRepository.findOne({ filter: { uuid: input.dealUuid }, transaction });
    const target = await computeDealStage(app, input.dealUuid, { transaction });

    if (!target) {
      return { outcome: 'no-projects', stage: null, previousStage: null };
    }
    if (!deal) {
      // Nothing local knows this deal yet, so there is nothing to move it from.
      return { outcome: 'no-projects', stage: target, previousStage: null };
    }

    const currentStage = deal.get('currentStage') as CrmStage;
    if (stageIndex(target) <= stageIndex(currentStage)) {
      return { outcome: 'not-forward', stage: target, previousStage: currentStage };
    }

    if (deal.get('stageSetManually')) {
      const note = `Automation would have moved this deal to "${target}" (${input.reason}), but its stage was set by hand to "${currentStage}".`;
      await dealRepository.update({
        filterByTk: deal.get('id') as number,
        values: { conflictNote: note, conflictAt: new Date() },
        transaction,
      });
      app.logger.warn(`[crm-integration] ${note}`, { dealUuid: input.dealUuid });
      return { outcome: 'manual-override', stage: target, previousStage: currentStage };
    }

    await dealRepository.update({
      filterByTk: deal.get('id') as number,
      values: { currentStage: target, stageUpdatedAt: new Date() },
      transaction,
    });

    const payload: WorkspaceProjectStageReachedPayload = {
      projectUuid: input.projectUuid,
      dealUuid: input.dealUuid,
      organisationUuid: deal.get('organisationUuid') as string,
      stage: target,
      previousStage: currentStage,
      phaseName: input.phaseName,
      reason: input.reason,
    };
    await writeOutboxEvent(
      app,
      {
        name: WORKSPACE_EVENT.projectStageReached,
        payload: payload as unknown as Record<string, unknown>,
        origin: 'automation',
        depth: (input.depth ?? 0) + 1,
      },
      { transaction },
    );

    return { outcome: 'emitted', stage: target, previousStage: currentStage };
  });
}
