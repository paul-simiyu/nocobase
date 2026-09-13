/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Application } from '@nocobase/server';
import { Op } from '@nocobase/database';
import { COLLECTION, DEFAULTS } from '../../constants';
import type { EventOrigin } from '../../types';
import { errorMessage } from '../utils';
import { OUTBOX_LOCK_KEY, toEnvelope } from './outbox';
import type { StreamTransport } from './redis-stream';

export interface OutboxPublisherOptions {
  stream: string;
  intervalMs?: number;
  batchSize?: number;
  maxAttempts?: number;
}

/**
 * Drains the outbox onto the Workspace stream. Nothing here reaches into the CRM: it appends
 * to a stream the CRM reads on its own schedule.
 */
export class OutboxPublisher {
  private timer: NodeJS.Timeout | null = null;
  private draining = false;

  constructor(
    private readonly app: Application,
    private readonly stream: StreamTransport,
    private readonly options: OutboxPublisherOptions,
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    const intervalMs = this.options.intervalMs ?? DEFAULTS.publishIntervalMs;
    this.timer = setInterval(() => {
      this.drain().catch((err) => {
        this.app.logger.error(`[crm-integration] outbox drain failed: ${errorMessage(err)}`, { err });
      });
    }, intervalMs);
    // Never hold the process open for the sake of the next tick.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Publish one batch. Held under a cluster-wide lock so several app instances sharing a
   * database do not each publish the same row.
   */
  async drain(): Promise<number> {
    if (this.draining) {
      return 0;
    }
    this.draining = true;
    try {
      return await this.app.lockManager.runExclusive(OUTBOX_LOCK_KEY, () => this.drainBatch(), 30_000);
    } finally {
      this.draining = false;
    }
  }

  private async drainBatch(): Promise<number> {
    if (!(await this.stream.isAvailable())) {
      return 0;
    }
    const repository = this.app.db.getRepository(COLLECTION.outbox);
    const rows = await repository.find({
      filter: {
        status: 'pending',
        availableAt: { [Op.lte]: new Date() },
      },
      sort: ['id'],
      limit: this.options.batchSize ?? DEFAULTS.publishBatchSize,
    });

    let published = 0;
    for (const row of rows) {
      const id = row.get('id') as number;
      try {
        const envelope = toEnvelope({
          uuid: row.get('uuid') as string,
          eventName: row.get('eventName') as string,
          payload: (row.get('payload') as Record<string, unknown>) ?? {},
          origin: row.get('origin') as EventOrigin,
          depth: row.get('depth') as number,
          createdAt: row.get('createdAt') as Date,
        });
        const messageId = await this.stream.publish(this.options.stream, JSON.stringify(envelope));
        await repository.update({
          filterByTk: id,
          values: {
            status: 'published',
            publishedAt: new Date(),
            streamMessageId: messageId,
            lastError: null,
          },
        });
        published += 1;
      } catch (err) {
        await this.recordFailure(id, (row.get('attempts') as number) ?? 0, err);
      }
    }
    return published;
  }

  private async recordFailure(id: number, attempts: number, err: unknown): Promise<void> {
    const nextAttempts = attempts + 1;
    const maxAttempts = this.options.maxAttempts ?? DEFAULTS.maxPublishAttempts;
    const exhausted = nextAttempts >= maxAttempts;
    // Back off 2s, 4s, 8s ... so a Redis outage does not spin the loop.
    const backoffMs = Math.min(2 ** nextAttempts * 1000, 300_000);
    await this.app.db.getRepository(COLLECTION.outbox).update({
      filterByTk: id,
      values: {
        status: exhausted ? 'failed' : 'pending',
        attempts: nextAttempts,
        availableAt: new Date(Date.now() + backoffMs),
        lastError: errorMessage(err),
      },
    });
    this.app.logger.error(`[crm-integration] failed to publish outbox row ${id}: ${errorMessage(err)}`, { err });
  }
}
