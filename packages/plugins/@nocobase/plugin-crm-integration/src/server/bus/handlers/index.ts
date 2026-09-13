/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { CRM_EVENT } from '../../../constants';
import type { EventDispatcher } from '../dispatcher';
import { handleDealStageChanged } from './deal-stage-changed';
import { handleDealWon } from './deal-won';
import { handleOrganisationUpserted } from './organisation-upserted';

/**
 * Every CRM event this app is willing to act on. Anything not registered here is recorded
 * and skipped rather than guessed at.
 */
export function registerCrmHandlers(dispatcher: EventDispatcher): void {
  dispatcher.register(CRM_EVENT.organisationUpserted, handleOrganisationUpserted);
  dispatcher.register(CRM_EVENT.dealWon, handleDealWon);
  dispatcher.register(CRM_EVENT.dealStageChanged, handleDealStageChanged);
}
