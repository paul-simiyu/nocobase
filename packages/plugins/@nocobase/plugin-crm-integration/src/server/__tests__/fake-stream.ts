/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { StreamMessage, StreamReadOptions, StreamTransport } from '../bus/redis-stream';

/**
 * An in-memory stand-in for a Redis stream, so the bus can be tested end to end without a
 * broker. Deliberately simple: append, read undelivered, acknowledge.
 */
export class FakeStream implements StreamTransport {
  private readonly entries = new Map<string, StreamMessage[]>();
  private readonly delivered = new Set<string>();
  private readonly acked = new Set<string>();
  private sequence = 0;

  available = true;
  failNextPublish: Error | null = null;

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async publish(stream: string, payload: string): Promise<string> {
    if (this.failNextPublish) {
      const err = this.failNextPublish;
      this.failNextPublish = null;
      throw err;
    }
    this.sequence += 1;
    const id = `${this.sequence}-0`;
    const list = this.entries.get(stream) ?? [];
    list.push({ id, data: payload });
    this.entries.set(stream, list);
    return id;
  }

  async ensureGroup(): Promise<void> {}

  async read(stream: string, group: string, consumer: string, options: StreamReadOptions): Promise<StreamMessage[]> {
    const list = this.entries.get(stream) ?? [];
    const pending = list.filter((entry) => !this.delivered.has(`${stream}:${entry.id}`));
    const batch = pending.slice(0, options.count);
    for (const entry of batch) {
      this.delivered.add(`${stream}:${entry.id}`);
    }
    return batch;
  }

  async ack(stream: string, group: string, id: string): Promise<void> {
    this.acked.add(`${stream}:${id}`);
  }

  /** Everything written to a stream, in order, as parsed envelopes. */
  published<T = Record<string, unknown>>(stream: string): T[] {
    return (this.entries.get(stream) ?? []).map((entry) => JSON.parse(entry.data) as T);
  }

  ackedCount(): number {
    return this.acked.size;
  }
}
