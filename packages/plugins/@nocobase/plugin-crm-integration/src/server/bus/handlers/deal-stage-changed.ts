/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Application } from '@nocobase/server';
import { COLLECTION, CRM_STAGES } from '../../../constants';
import type { CrmStage, EventEnvelope } from '../../../types';
import { asRecord, EventPayloadError, logHandled } from './payloads';

function parseStage(value: unknown, eventName: string): CrmStage {
  if (typeof value !== 'string' || !(CRM_STAGES as readonly string[]).includes(value)) {
    throw new EventPayloadError(`${eventName} has unknown stage "${String(value)}"`);
  }
  return value as CrmStage;
}

/**
 * Keep the local mirror of a deal's stage in step with the CRM.
 *
 * This handler never emits anything. That is the loop guard working: a stage change the CRM
 * made *because of us* arrives with `origin: automation` and lands here as a plain update,
 * so the two listeners cannot ping-pong. A change a person made by hand sets
 * `stageSetManually`, which makes the ratchet stand down and log a conflict instead of
 * overwriting their decision.
 */
export async function handleDealStageChanged(app: Application, envelope: EventEnvelope): Promise<void> {
  const payload = asRecord(envelope);
  const dealUuid = payload.dealUuid;
  if (typeof dealUuid !== 'string' || !dealUuid) {
    throw new EventPayloadError(`${envelope.name} is missing "dealUuid"`);
  }
  const stage = parseStage(payload.stage, envelope.name);

  const dealRepository = app.db.getRepository(COLLECTION.deals);
  const deal = await dealRepository.findOne({ filter: { uuid: dealUuid } });
  if (!deal) {
    logHandled(app, envelope, `deal ${dealUuid} is not mirrored here, ignored`);
    return;
  }

  const wasManual = deal.get('stageSetManually') as boolean;
  const setManually = envelope.origin === 'automation' ? false : payload.manual === true;
  const stageChanged = (deal.get('currentStage') as CrmStage) !== stage;

  await dealRepository.update({
    filterByTk: deal.get('id') as number,
    values: {
      currentStage: stage,
      stageSetManually: setManually,
      stageUpdatedAt: new Date(),
      // A recorded conflict is about a stage that has now moved on.
      ...(stageChanged || (wasManual && !setManually) ? { conflictNote: null, conflictAt: null } : {}),
    },
  });

  logHandled(app, envelope, `deal ${dealUuid} mirrored at "${stage}"${setManually ? ' (set by hand)' : ''}`);
}
