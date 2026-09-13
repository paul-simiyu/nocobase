/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Application } from '@nocobase/server';
import type { Transactionable } from '@nocobase/database';
import { COLLECTION, DEFAULTS, SYSTEM } from '../../constants';
import type { EventOrigin } from '../../types';
import { withTransaction } from '../utils';

export interface OutboxEventInput {
  name: string;
  payload: Record<string, unknown>;
  origin?: EventOrigin;
  depth?: number;
}

export interface OutboxRow {
  id: number;
  uuid: string;
  eventName: string;
}

/**
 * Write an event to this app's outbox. Call it inside the transaction that makes the business
 * change: the row is the durable record the publisher later hands to Redis, so a dropped
 * message is replayable rather than lost.
 */
export async function writeOutboxEvent(
  app: Application,
  input: OutboxEventInput,
  options?: Transactionable,
): Promise<OutboxRow> {
  return withTransaction(app.db, options, async (transaction) => {
    const record = await app.db.getRepository(COLLECTION.outbox).create({
      values: {
        eventName: input.name,
        payload: input.payload,
        origin: input.origin ?? 'system',
        depth: input.depth ?? 0,
        status: 'pending',
        availableAt: new Date(),
      },
      transaction,
    });
    return {
      id: record.get('id') as number,
      uuid: record.get('uuid') as string,
      eventName: record.get('eventName') as string,
    };
  });
}

/** Shape an outbox row into the envelope that goes on the wire. */
export function toEnvelope(record: {
  uuid: string;
  eventName: string;
  payload: Record<string, unknown>;
  origin: EventOrigin;
  depth: number;
  createdAt?: Date;
}) {
  return {
    uuid: record.uuid,
    name: record.eventName,
    source: SYSTEM.workspace,
    origin: record.origin,
    depth: record.depth,
    occurredAt: (record.createdAt ?? new Date()).toISOString(),
    payload: record.payload ?? {},
  };
}

export const OUTBOX_LOCK_KEY = `${DEFAULTS.consumerGroup}:crm-integration:outbox`;
