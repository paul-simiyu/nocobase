/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { ActionModel, ActionSceneEnum } from '@nocobase/client';
import { type FlowContext, tExpr } from '@nocobase/flow-engine';
import type { ButtonProps } from 'antd';
import { NAMESPACE } from '../constants';
import { readHarvestResult } from './harvestResult';

const label = (key: string) => tExpr(key, { ns: NAMESPACE, nsMode: 'fallback' });

const translate = (ctx: FlowContext, key: string, options: Record<string, unknown> = {}) =>
  ctx.t(key, { ns: [NAMESPACE, 'client'], nsMode: 'fallback', ...options });

export class HarvestTendersActionModel extends ActionModel {
  static scene = ActionSceneEnum.collection;

  defaultProps: ButtonProps = {
    title: label('Harvest now'),
    icon: 'CloudDownloadOutlined',
  };
}

HarvestTendersActionModel.define({
  label: label('Harvest tenders'),
  toggleable: true,
});

HarvestTendersActionModel.registerFlow({
  key: 'harvestSettings',
  title: label('Harvest settings'),
  on: 'click',
  steps: {
    harvest: {
      async handler(ctx: FlowContext) {
        ctx.model.setProps({ loading: true });
        try {
          const response = await ctx.api.resource('tenderRadar').harvest();
          const result = readHarvestResult(response?.data);

          ctx.message.success(
            translate(ctx, 'Harvested {{created}} new and {{updated}} updated tender(s) from {{sources}} source(s).', {
              created: result.created,
              updated: result.updated,
              sources: result.sources,
            }),
          );

          // A partial failure still created rows, so it is a warning, not an error.
          if (result.failed.length) {
            ctx.message.warning(
              translate(ctx, '{{count}} source(s) failed: {{names}}. See the harvest runs for details.', {
                count: result.failed.length,
                names: result.failed.map((entry) => entry.sourceKey).join(', '),
              }),
            );
          }

          await ctx.blockModel?.resource?.refresh?.();
        } catch (error) {
          ctx.message.error(
            translate(ctx, 'Harvest failed: {{reason}}', {
              reason: error instanceof Error ? error.message : String(error),
            }),
          );
        } finally {
          ctx.model.setProps({ loading: false });
        }
      },
    },
  },
});
