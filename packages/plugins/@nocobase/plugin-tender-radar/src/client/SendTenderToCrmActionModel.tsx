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
import { readSendOutcome } from './sendOutcome';

const label = (key: string) => tExpr(key, { ns: NAMESPACE, nsMode: 'fallback' });

const translate = (ctx: FlowContext, key: string, options: Record<string, unknown> = {}) =>
  ctx.t(key, { ns: [NAMESPACE, 'client'], nsMode: 'fallback', ...options });

export class SendTenderToCrmActionModel extends ActionModel {
  static scene = ActionSceneEnum.record;

  defaultProps: ButtonProps = {
    type: 'link',
    title: label('Send to CRM'),
    icon: 'ExportOutlined',
  };
}

SendTenderToCrmActionModel.define({
  label: label('Send to CRM'),
  toggleable: true,
});

SendTenderToCrmActionModel.registerFlow({
  key: 'sendToCrmSettings',
  title: label('Send to CRM settings'),
  on: 'click',
  steps: {
    send: {
      async handler(ctx: FlowContext) {
        const tenderId = ctx.filterByTk ?? ctx.record?.id;
        if (tenderId === undefined || tenderId === null) {
          ctx.message.error(translate(ctx, 'No tender selected.'));
          return;
        }

        ctx.model.setProps({ loading: true });
        try {
          const response = await ctx.api.resource('tenderRadar').sendToCrm({ values: { tenderId } });
          const outcome = readSendOutcome(response?.data);

          if (outcome.status === 'sent') {
            ctx.message.success(translate(ctx, 'Sent to the CRM as a new lead.'));
          } else if (outcome.status === 'skipped') {
            // Not an error: the lead exists and may since have been edited.
            ctx.message.info(translate(ctx, 'Already in the CRM - not sent again.'));
          } else {
            ctx.message.error(
              translate(ctx, 'Could not send to the CRM: {{reason}}', {
                reason: outcome.reason ?? translate(ctx, 'no reason given'),
              }),
            );
          }

          await ctx.blockModel?.resource?.refresh?.();
        } catch (error) {
          ctx.message.error(
            translate(ctx, 'Could not send to the CRM: {{reason}}', {
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
