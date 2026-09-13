/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Application } from '@nocobase/server';
import { UniqueConstraintError } from '@nocobase/database';
import { COLLECTION, MAX_EVENT_DEPTH } from '../../constants';
import type { EventEnvelope, EventOrigin } from '../../types';
import { errorMessage } from '../utils';

export type EventHandler = (app: Application, envelope: EventEnvelope) => Promise<void>;

export type DispatchOutcome = 'processed' | 'skipped' | 'failed' | 'duplicate' | 'rejected';

export interface DispatchResult {
  outcome: DispatchOutcome;
  reason?: string;
}

function parseEnvelope(raw: unknown): EventEnvelope | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const candidate = raw as Partial<EventEnvelope>;
  if (typeof candidate.uuid !== 'string' || !candidate.uuid) {
    return null;
  }
  if (typeof candidate.name !== 'string' || !candidate.name) {
    return null;
  }
  return {
    uuid: candidate.uuid,
    name: candidate.name,
    source: typeof candidate.source === 'string' ? candidate.source : 'unknown',
    origin: (candidate.origin as EventOrigin) ?? 'system',
    depth: typeof candidate.depth === 'number' ? candidate.depth : 0,
    occurredAt: typeof candidate.occurredAt === 'string' ? candidate.occurredAt : new Date().toISOString(),
    payload: candidate.payload ?? {},
  };
}

/**
 * Routes inbound events to handlers, exactly once each.
 *
 * The inbox row is claimed by event UUID *before* the handler runs, so a redelivered message
 * — or a crash midway through — finds its own row and stops rather than provisioning a second
 * portal. The depth guard is the other half of the loop guard: an automation firing an action
 * that fires the same automation would otherwise ping-pong forever.
 */
export class EventDispatcher {
  private readonly handlers = new Map<string, EventHandler>();

  constructor(private readonly app: Application) {}

  register(name: string, handler: EventHandler): void {
    this.handlers.set(name, handler);
  }

  registered(): string[] {
    return [...this.handlers.keys()];
  }

  async dispatchRaw(raw: string): Promise<DispatchResult> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      this.app.logger.error(`[crm-integration] unparseable event: ${errorMessage(err)}`, { err });
      return { outcome: 'rejected', reason: 'unparseable' };
    }
    const envelope = parseEnvelope(parsed);
    if (!envelope) {
      this.app.logger.error('[crm-integration] event missing uuid or name, dropped');
      return { outcome: 'rejected', reason: 'malformed' };
    }
    return this.dispatch(envelope);
  }

  async dispatch(envelope: EventEnvelope): Promise<DispatchResult> {
    const repository = this.app.db.getRepository(COLLECTION.inbox);

    if (envelope.depth >= MAX_EVENT_DEPTH) {
      await this.claim(envelope, 'skipped', `depth ${envelope.depth} exceeds maximum ${MAX_EVENT_DEPTH}`);
      this.app.logger.warn(`[crm-integration] dropped ${envelope.name}: event depth ${envelope.depth} too deep`);
      return { outcome: 'skipped', reason: 'max-depth' };
    }

    const handler = this.handlers.get(envelope.name);
    if (!handler) {
      await this.claim(envelope, 'skipped', 'no handler registered');
      return { outcome: 'skipped', reason: 'no-handler' };
    }

    const claimed = await this.claim(envelope, 'processing');
    if (!claimed) {
      return { outcome: 'duplicate' };
    }

    try {
      await handler(this.app, envelope);
      await repository.update({
        filter: { eventUuid: envelope.uuid },
        values: { status: 'processed', processedAt: new Date(), lastError: null },
      });
      return { outcome: 'processed' };
    } catch (err) {
      const message = errorMessage(err);
      await repository.update({
        filter: { eventUuid: envelope.uuid },
        values: { status: 'failed', lastError: message },
      });
      this.app.logger.error(`[crm-integration] handler for ${envelope.name} failed: ${message}`, { err });
      return { outcome: 'failed', reason: message };
    }
  }

  /**
   * Reprocess events whose handler threw. Deliberately an operator action: a poison message
   * is acknowledged on the stream so it cannot block the ones behind it, and its inbox row
   * is where it waits.
   */
  async retryFailed(limit = 20): Promise<number> {
    const repository = this.app.db.getRepository(COLLECTION.inbox);
    const rows = await repository.find({ filter: { status: 'failed' }, sort: ['id'], limit });
    let recovered = 0;
    for (const row of rows) {
      const handler = this.handlers.get(row.get('eventName') as string);
      if (!handler) {
        continue;
      }
      const envelope: EventEnvelope = {
        uuid: row.get('eventUuid') as string,
        name: row.get('eventName') as string,
        source: row.get('source') as string,
        origin: row.get('origin') as EventOrigin,
        depth: row.get('depth') as number,
        occurredAt: (row.get('createdAt') as Date)?.toISOString() ?? new Date().toISOString(),
        payload: (row.get('payload') as Record<string, unknown>) ?? {},
      };
      try {
        await handler(this.app, envelope);
        await repository.update({
          filterByTk: row.get('id') as number,
          values: { status: 'processed', processedAt: new Date(), lastError: null },
        });
        recovered += 1;
      } catch (err) {
        await repository.update({
          filterByTk: row.get('id') as number,
          values: {
            attempts: ((row.get('attempts') as number) ?? 0) + 1,
            lastError: errorMessage(err),
          },
        });
      }
    }
    return recovered;
  }

  /** Returns false when this event has already been claimed by an earlier delivery. */
  private async claim(envelope: EventEnvelope, status: string, lastError?: string): Promise<boolean> {
    try {
      await this.app.db.getRepository(COLLECTION.inbox).create({
        values: {
          eventUuid: envelope.uuid,
          eventName: envelope.name,
          source: envelope.source,
          origin: envelope.origin,
          depth: envelope.depth,
          payload: envelope.payload as Record<string, unknown>,
          status,
          lastError: lastError ?? null,
          processedAt: status === 'processing' ? null : new Date(),
        },
      });
      return true;
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        return false;
      }
      throw err;
    }
  }
}
