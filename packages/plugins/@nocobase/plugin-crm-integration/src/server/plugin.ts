/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/server';
import type { Context, Next } from '@nocobase/actions';
import { DEFAULTS, SYSTEM } from '../constants';
import { createProjectAction, provisionClientPortalAction } from './actions/internal';
import { completePhaseAction, requestApprovalAction, submitApprovalAction } from './actions/phases';
import { InboxConsumer } from './bus/consumer';
import { EventDispatcher } from './bus/dispatcher';
import { registerCrmHandlers } from './bus/handlers';
import { OutboxPublisher } from './bus/publisher';
import { RedisStreamClient } from './bus/redis-stream';
import { seedServiceTracks } from './delivery/provisioning';
import { internalApiGuard } from './middleware/internal-api-guard';
import { errorMessage } from './utils';

export const INTERNAL_RESOURCE = 'crmInternal';
export const PHASES_RESOURCE = 'deliveryPhases';

/**
 * The Workspace half of the Workspace ↔ CRM integration.
 *
 * Two engines, not one brain: this app keeps its own rules and its own database, and the two
 * talk through a shared Redis stream plus a narrow internal actions API. Neither side ever
 * reaches into the other's tables.
 */
export class PluginCrmIntegrationServer extends Plugin {
  dispatcher: EventDispatcher;
  streamClient: RedisStreamClient;
  publisher: OutboxPublisher;
  consumer: InboxConsumer;

  get crmStream(): string {
    return process.env.CRM_INTEGRATION_CRM_STREAM || DEFAULTS.crmStream;
  }

  get workspaceStream(): string {
    return process.env.CRM_INTEGRATION_WORKSPACE_STREAM || DEFAULTS.workspaceStream;
  }

  get consumerGroup(): string {
    return process.env.CRM_INTEGRATION_CONSUMER_GROUP || DEFAULTS.consumerGroup;
  }

  async beforeLoad() {
    this.app.resourceManager.define({
      name: INTERNAL_RESOURCE,
      actions: {
        createProject: createProjectAction,
        provisionClientPortal: provisionClientPortalAction,
      },
      only: ['createProject', 'provisionClientPortal'],
    });

    this.app.resourceManager.define({
      name: PHASES_RESOURCE,
      actions: {
        submitApproval: submitApprovalAction,
        requestApproval: requestApprovalAction,
        completePhase: completePhaseAction,
      },
      only: ['submitApproval', 'requestApproval', 'completePhase'],
    });

    // The internal API carries no user session; its own guard is what authorises it.
    this.app.acl.allow(INTERNAL_RESOURCE, '*', 'public');
    // A client approving their own gate is an ordinary signed-in portal user.
    this.app.acl.allow(PHASES_RESOURCE, 'submitApproval', 'loggedIn');
    // Driving delivery forward is studio work, granted by role.
    this.app.acl.registerSnippet({
      name: ['pm', this.name, 'delivery'].join('.'),
      actions: [`${PHASES_RESOURCE}:requestApproval`, `${PHASES_RESOURCE}:completePhase`],
    });
  }

  async load() {
    this.dispatcher = new EventDispatcher(this.app);
    registerCrmHandlers(this.dispatcher);

    this.streamClient = new RedisStreamClient(this.app, 'crm-integration');
    this.publisher = new OutboxPublisher(this.app, this.streamClient, { stream: this.workspaceStream });
    this.consumer = new InboxConsumer(this.app, this.streamClient, this.dispatcher, {
      stream: this.crmStream,
      group: this.consumerGroup,
      consumerName: `${SYSTEM.workspace}-${process.pid}`,
    });

    this.app.resourcer.use(
      async (ctx: Context, next: Next) => {
        if (ctx.action?.resourceName !== INTERNAL_RESOURCE) {
          return next();
        }
        return internalApiGuard(ctx, next);
      },
      { group: INTERNAL_RESOURCE, before: 'acl', after: 'auth' },
    );

    this.app.on('afterStart', async () => {
      this.publisher.start();
      try {
        await this.consumer.start();
      } catch (err) {
        this.app.logger.error(`[crm-integration] consumer failed to start: ${errorMessage(err)}`, { err });
      }
    });

    this.app.on('beforeStop', async () => {
      this.publisher.stop();
      await this.consumer.stop();
    });
  }

  async install() {
    await seedServiceTracks(this.app);
  }

  /** Seeding is additive: a new track version added to the code appears on upgrade. */
  async upgrade() {
    await seedServiceTracks(this.app);
  }
}

export default PluginCrmIntegrationServer;
