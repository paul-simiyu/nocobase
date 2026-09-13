/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Application } from '@nocobase/server';
import { SERVICE_TYPES } from '../../../constants';
import type { CrmDealWonPayload, CrmOrganisationUpsertedPayload, EventEnvelope, ServiceType } from '../../../types';

export class EventPayloadError extends Error {}

function requireString(payload: Record<string, unknown>, key: string, eventName: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || !value) {
    throw new EventPayloadError(`${eventName} is missing "${key}"`);
  }
  return value;
}

function optionalString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value ? value : undefined;
}

export function asRecord(envelope: EventEnvelope): Record<string, unknown> {
  if (!envelope.payload || typeof envelope.payload !== 'object') {
    throw new EventPayloadError(`${envelope.name} has no payload`);
  }
  return envelope.payload as Record<string, unknown>;
}

export function parseOrganisationUpserted(envelope: EventEnvelope): CrmOrganisationUpsertedPayload {
  const payload = asRecord(envelope);
  return {
    organisationUuid: requireString(payload, 'organisationUuid', envelope.name),
    name: requireString(payload, 'name', envelope.name),
    primaryContactName: optionalString(payload, 'primaryContactName'),
    primaryContactEmail: optionalString(payload, 'primaryContactEmail'),
  };
}

export function parseDealWon(envelope: EventEnvelope): CrmDealWonPayload {
  const payload = asRecord(envelope);
  const serviceType = requireString(payload, 'serviceType', envelope.name);
  if (!(SERVICE_TYPES as readonly string[]).includes(serviceType)) {
    throw new EventPayloadError(`${envelope.name} has unknown service type "${serviceType}"`);
  }
  return {
    dealUuid: requireString(payload, 'dealUuid', envelope.name),
    organisationUuid: requireString(payload, 'organisationUuid', envelope.name),
    serviceType: serviceType as ServiceType,
    organisationName: optionalString(payload, 'organisationName'),
    dealName: optionalString(payload, 'dealName'),
    clientContactEmail: optionalString(payload, 'clientContactEmail'),
    clientContactName: optionalString(payload, 'clientContactName'),
  };
}

export function logHandled(app: Application, envelope: EventEnvelope, detail: string): void {
  app.logger.info(`[crm-integration] ${envelope.name}: ${detail}`, { eventUuid: envelope.uuid });
}
