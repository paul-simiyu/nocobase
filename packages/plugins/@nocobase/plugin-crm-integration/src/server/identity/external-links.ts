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
import { COLLECTION, SYSTEM } from '../../constants';
import type { CrmOrganisationUpsertedPayload } from '../../types';
import { withTransaction } from '../utils';

export type LocalType = 'project' | 'organisation';

export interface LinkRef {
  localType: LocalType;
  remoteUuid: string;
  remoteSystem?: string;
}

/**
 * Find what a remote record maps to locally. A multi-service deal maps to one project per
 * track, so this returns every match rather than assuming one.
 */
export async function findLinkedLocalIds(app: Application, ref: LinkRef, options?: Transactionable): Promise<string[]> {
  const records = await app.db.getRepository(COLLECTION.externalLinks).find({
    filter: {
      localType: ref.localType,
      remoteSystem: ref.remoteSystem ?? SYSTEM.crm,
      remoteUuid: ref.remoteUuid,
    },
    transaction: options?.transaction,
  });
  return records.map((record) => record.get('localId') as string);
}

export async function createLink(
  app: Application,
  input: LinkRef & { localId: string | number },
  options?: Transactionable,
): Promise<void> {
  await app.db.getRepository(COLLECTION.externalLinks).create({
    values: {
      localType: input.localType,
      localId: String(input.localId),
      remoteSystem: input.remoteSystem ?? SYSTEM.crm,
      remoteUuid: input.remoteUuid,
    },
    transaction: options?.transaction,
  });
}

/**
 * Sync the canonical organisation. This is the first thing to get right: deal-to-project and
 * contact-to-member both hang off this UUID, and without it the two systems end up matching
 * on client names.
 */
export async function upsertOrganisation(
  app: Application,
  payload: CrmOrganisationUpsertedPayload,
  options?: Transactionable,
): Promise<{ uuid: string; created: boolean }> {
  return withTransaction(app.db, options, async (transaction) => {
    const repository = app.db.getRepository(COLLECTION.organisations);
    const existing = await repository.findOne({
      filter: { uuid: payload.organisationUuid },
      transaction,
    });

    const values = {
      name: payload.name,
      primaryContactName: payload.primaryContactName ?? null,
      primaryContactEmail: payload.primaryContactEmail ?? null,
      syncedAt: new Date(),
    };

    if (existing) {
      await repository.update({
        filterByTk: existing.get('id') as number,
        values,
        transaction,
      });
      return { uuid: payload.organisationUuid, created: false };
    }

    await repository.create({
      values: { ...values, uuid: payload.organisationUuid },
      transaction,
    });
    return { uuid: payload.organisationUuid, created: true };
  });
}
