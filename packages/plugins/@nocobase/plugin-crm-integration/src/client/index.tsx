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
 * Client entry point. The portal UI — phase strip, gate banner and approval trail — is not
 * built yet; this pass is the server-side integration and gate approval API it will sit on.
 */
export class PluginCrmIntegrationClient extends Plugin {
  async load() {}
}

export default PluginCrmIntegrationClient;
