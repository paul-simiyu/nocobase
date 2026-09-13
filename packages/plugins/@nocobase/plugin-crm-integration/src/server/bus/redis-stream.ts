/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Application, Redis } from '@nocobase/server';

export interface StreamMessage {
  id: string;
  data: string;
}

export interface StreamReadOptions {
  count: number;
  blockMs: number;
}

/** What the publisher and consumer actually need. Redis is one implementation of it. */
export interface StreamTransport {
  isAvailable(): Promise<boolean>;
  publish(stream: string, payload: string): Promise<string>;
  ensureGroup(stream: string, group: string): Promise<void>;
  read(stream: string, group: string, consumer: string, options: StreamReadOptions): Promise<StreamMessage[]>;
  ack(stream: string, group: string, id: string): Promise<void>;
}

interface RawStreamRead {
  name: string;
  messages: Array<{ id: string; message: Record<string, string> }>;
}

function isRawStreamRead(value: unknown): value is RawStreamRead {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<RawStreamRead>;
  return typeof candidate.name === 'string' && Array.isArray(candidate.messages);
}

/**
 * The mail tray between the two apps. Same server means HTTP can be skipped entirely: each
 * side appends to its own stream and reads the other's through a consumer group, so a
 * restart resumes where it left off rather than replaying from the beginning.
 */
export class RedisStreamClient implements StreamTransport {
  constructor(
    private readonly app: Application,
    private readonly connectionKey: string,
  ) {}

  private async connection(): Promise<Redis> {
    return this.app.redisConnectionManager.getConnectionSync(this.connectionKey);
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.connection();
      return true;
    } catch {
      return false;
    }
  }

  async publish(stream: string, payload: string): Promise<string> {
    const client = await this.connection();
    const id = await client.xAdd(stream, '*', { data: payload });
    // The client's types allow a Buffer reply; stream ids are always ascii text.
    return typeof id === 'string' ? id : id.toString();
  }

  /** Idempotent: an existing group is not an error, it is the normal restart case. */
  async ensureGroup(stream: string, group: string): Promise<void> {
    const client = await this.connection();
    try {
      await client.xGroupCreate(stream, group, '0', { MKSTREAM: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes('BUSYGROUP')) {
        throw err;
      }
    }
  }

  async read(stream: string, group: string, consumer: string, options: StreamReadOptions): Promise<StreamMessage[]> {
    const client = await this.connection();
    const reply = await client.xReadGroup(
      group,
      consumer,
      { key: stream, id: '>' },
      { COUNT: options.count, BLOCK: options.blockMs },
    );
    if (!Array.isArray(reply)) {
      return [];
    }
    const messages: StreamMessage[] = [];
    for (const entry of reply) {
      if (!isRawStreamRead(entry) || entry.name !== stream) {
        continue;
      }
      for (const message of entry.messages) {
        messages.push({ id: message.id, data: message.message?.data ?? '' });
      }
    }
    return messages;
  }

  async ack(stream: string, group: string, id: string): Promise<void> {
    const client = await this.connection();
    await client.xAck(stream, group, id);
  }
}
