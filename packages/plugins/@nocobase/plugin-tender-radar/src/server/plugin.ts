/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { resolve } from 'node:path';
import { type InstallOptions, Plugin } from '@nocobase/server';
import { TENDER_SOURCES_COLLECTION } from '../constants';
import { brief, harvest, sendToCrm, sources } from './actions/tenderRadar';
import { getAdapter, SELF_CONFIGURING_KEYS } from './sources';

export class PluginTenderRadarServer extends Plugin {
  async load() {
    await this.importCollections(resolve(__dirname, 'collections'));

    this.app.resourceManager.define({
      name: 'tenderRadar',
      actions: { harvest, brief, sources, sendToCrm },
    });

    // Both of these make outbound requests - one to public portals, one to the
    // CRM with a stored credential - so they stay permissioned rather than
    // being something any signed-in user can trigger.
    this.app.acl.registerSnippet({
      name: `pm.${this.name}.harvest`,
      actions: ['tenderRadar:harvest', 'tenderRadar:sendToCrm'],
    });

    this.app.acl.allow('tenderRadar', 'brief', 'loggedIn');
    this.app.acl.allow('tenderRadar', 'sources', 'loggedIn');
  }

  /**
   * Seeds the sources that need no credentials, so a fresh install can harvest
   * immediately. Sources requiring config (ReliefWeb's `appname`, a feed URL) are
   * left for the operator to add.
   */
  async install(options?: InstallOptions) {
    const repository = this.db.getRepository(TENDER_SOURCES_COLLECTION);

    for (const key of SELF_CONFIGURING_KEYS) {
      const existing = await repository.findOne({ filter: { sourceKey: key } });
      if (existing) {
        continue;
      }
      const adapter = getAdapter(key);
      await repository.create({
        values: {
          sourceKey: key,
          title: adapter?.label ?? key,
          enabled: true,
          config: {},
          lookbackDays: 30,
          limit: 200,
        },
      });
    }
  }
}

export default PluginTenderRadarServer;
