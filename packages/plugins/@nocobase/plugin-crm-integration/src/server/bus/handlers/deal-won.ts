/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Application } from '@nocobase/server';
import { COLLECTION } from '../../../constants';
import type { CrmStage, EventEnvelope } from '../../../types';
import { upsertOrganisation } from '../../identity/external-links';
import { provisionClientPortal } from '../../delivery/provisioning';
import { withTransaction } from '../../utils';
import { logHandled, parseDealWon } from './payloads';

/**
 * Provision the client portal for a won deal.
 *
 * Fires on a dedicated "won" event rather than a stage change: stage changes are noisy and
 * deals bounce between Concept and Design, whereas winning is a deliberate act. Provisioning
 * is idempotent, so a deal reopened and re-won resumes the same portal.
 */
export async function handleDealWon(app: Application, envelope: EventEnvelope): Promise<void> {
  const payload = parseDealWon(envelope);

  await withTransaction(app.db, undefined, async (transaction) => {
    if (payload.organisationName) {
      await upsertOrganisation(
        app,
        { organisationUuid: payload.organisationUuid, name: payload.organisationName },
        { transaction },
      );
    }

    const dealRepository = app.db.getRepository(COLLECTION.deals);
    const existingDeal = await dealRepository.findOne({ filter: { uuid: payload.dealUuid }, transaction });
    const stage = (payload.stage as CrmStage) ?? 'strategy';
    if (existingDeal) {
      await dealRepository.update({
        filterByTk: existingDeal.get('id') as number,
        values: { name: payload.dealName ?? existingDeal.get('name'), wonAt: new Date() },
        transaction,
      });
    } else {
      await dealRepository.create({
        values: {
          uuid: payload.dealUuid,
          organisationUuid: payload.organisationUuid,
          name: payload.dealName ?? null,
          currentStage: stage,
          wonAt: new Date(),
        },
        transaction,
      });
    }

    const portal = await provisionClientPortal(
      app,
      {
        dealUuid: payload.dealUuid,
        organisationUuid: payload.organisationUuid,
        serviceType: payload.serviceType,
        organisationName: payload.organisationName,
        projectName: payload.dealName,
        clientContactEmail: payload.clientContactEmail,
        clientContactName: payload.clientContactName,
      },
      { transaction },
    );

    logHandled(
      app,
      envelope,
      `portal ${portal.created ? 'provisioned' : 'resumed'} for project ${portal.uuid} at ${portal.portalPath}`,
    );
  });
}
