/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Application } from '@nocobase/server';
import { DEFAULTS } from '../../constants';
import { errorMessage } from '../utils';
import type { EventDispatcher } from './dispatcher';
import type { StreamTransport } from './redis-stream';

export interface InboxConsumerOptions {
  stream: string;
  group: string;
  consumerName: string;
  batchSize?: number;
  blockMs?: number;
}

/**
 * Reads the CRM's stream through a consumer group and hands each message to the dispatcher.
 *
 * A message is acknowledged once its outcome is recorded, failures included: the inbox row
 * holds a failed event for retry, so one poison message cannot stall every event behind it.
 */
export class InboxConsumer {
  private running = false;
  private loop: Promise<void> | null = null;

  constructor(
    private readonly app: Application,
    private readonly stream: StreamTransport,
    private readonly dispatcher: EventDispatcher,
    private readonly options: InboxConsumerOptions,
  ) {}

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    if (!(await this.stream.isAvailable())) {
      this.app.logger.warn('[crm-integration] redis is not configured, inbound events are not being consumed');
      return;
    }
    await this.stream.ensureGroup(this.options.stream, this.options.group);
    this.running = true;
    this.loop = this.run();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.loop) {
      await this.loop;
      this.loop = null;
    }
  }

  private async run(): Promise<void> {
    while (this.running) {
      try {
        await this.pollOnce();
      } catch (err) {
        this.app.logger.error(`[crm-integration] consumer poll failed: ${errorMessage(err)}`, { err });
        await new Promise((resolve) => setTimeout(resolve, DEFAULTS.consumerBlockMs));
      }
    }
  }

  /** One read-and-handle cycle. Exposed so a test can drive the consumer without a timer. */
  async pollOnce(): Promise<number> {
    const messages = await this.stream.read(this.options.stream, this.options.group, this.options.consumerName, {
      count: this.options.batchSize ?? DEFAULTS.consumerBatchSize,
      blockMs: this.options.blockMs ?? DEFAULTS.consumerBlockMs,
    });
    for (const message of messages) {
      await this.dispatcher.dispatchRaw(message.data);
      await this.stream.ack(this.options.stream, this.options.group, message.id);
    }
    return messages.length;
  }
}
