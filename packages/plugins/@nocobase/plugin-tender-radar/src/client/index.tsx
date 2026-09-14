/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/client';
import * as models from './models';

/**
 * The `tenders`, `tenderSources` and `tenderHarvestRuns` collections are driven
 * with NocoBase's own blocks. This plugin adds only the two pieces those blocks
 * cannot express: a reader for the stored bid brief, and a button to harvest.
 */
export class PluginTenderRadarClient extends Plugin {
  async load() {
    this.app.flowEngine.registerModels(models);
  }
}

export default PluginTenderRadarClient;
