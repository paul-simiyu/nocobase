/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Application } from '@nocobase/server';
import type { EventEnvelope } from '../../../types';
import { upsertOrganisation } from '../../identity/external-links';
import { logHandled, parseOrganisationUpserted } from './payloads';

/**
 * Sync the canonical organisation. Build-order step one: deal-to-project and
 * contact-to-member both hang off this UUID.
 */
export async function handleOrganisationUpserted(app: Application, envelope: EventEnvelope): Promise<void> {
  const payload = parseOrganisationUpserted(envelope);
  const result = await upsertOrganisation(app, payload);
  logHandled(app, envelope, `organisation ${result.uuid} ${result.created ? 'created' : 'updated'}`);
}
