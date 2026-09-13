/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/client';

/**
 * Tender radar ships no bespoke UI: `tenders`, `tenderSources` and
 * `tenderHarvestRuns` are ordinary collections, so tables, forms, filters and
 * kanban views are built with NocoBase's own blocks against them. This entry
 * exists to register the plugin's i18n namespace on the client.
 */
export class PluginTenderRadarClient extends Plugin {
  async load() {}
}

export default PluginTenderRadarClient;
