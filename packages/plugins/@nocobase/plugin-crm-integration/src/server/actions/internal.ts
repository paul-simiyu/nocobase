/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Context, Next } from '@nocobase/actions';
import { SERVICE_TYPES } from '../../constants';
import type { ServiceType } from '../../types';
import { createProject, provisionClientPortal, ProvisioningError } from '../delivery/provisioning';

interface InternalActionValues {
  dealUuid?: unknown;
  organisationUuid?: unknown;
  serviceType?: unknown;
  projectName?: unknown;
  organisationName?: unknown;
  clientContactEmail?: unknown;
  clientContactName?: unknown;
}

function readString(values: InternalActionValues, key: keyof InternalActionValues): string | undefined {
  const value = values[key];
  return typeof value === 'string' && value ? value : undefined;
}

function requireCommonInput(ctx: Context) {
  const values = (ctx.action.params.values ?? {}) as InternalActionValues;
  const dealUuid = readString(values, 'dealUuid');
  const organisationUuid = readString(values, 'organisationUuid');
  const serviceType = readString(values, 'serviceType');

  if (!dealUuid) {
    ctx.throw(400, 'dealUuid is required');
  }
  if (!organisationUuid) {
    ctx.throw(400, 'organisationUuid is required');
  }
  if (!serviceType || !(SERVICE_TYPES as readonly string[]).includes(serviceType)) {
    ctx.throw(400, `serviceType must be one of: ${SERVICE_TYPES.join(', ')}`);
  }

  return {
    values,
    dealUuid: dealUuid as string,
    organisationUuid: organisationUuid as string,
    serviceType: serviceType as ServiceType,
  };
}

function handleProvisioningError(ctx: Context, err: unknown): never {
  if (err instanceof ProvisioningError) {
    return ctx.throw(400, err.message);
  }
  throw err;
}

/** `createProject(deal_uuid, org_uuid, service_type)` — a project with no client portal. */
export async function createProjectAction(ctx: Context, next: Next) {
  const input = requireCommonInput(ctx);
  try {
    ctx.body = await createProject(ctx.app, {
      dealUuid: input.dealUuid,
      organisationUuid: input.organisationUuid,
      serviceType: input.serviceType,
      projectName: readString(input.values, 'projectName'),
    });
  } catch (err) {
    handleProvisioningError(ctx, err);
  }
  await next();
}

/**
 * `provisionClientPortal(deal_uuid, org_uuid, template)` — project, phases, milestones and a
 * signed expiring invite. The invite is in the response and nowhere else; only its hash is
 * stored.
 */
export async function provisionClientPortalAction(ctx: Context, next: Next) {
  const input = requireCommonInput(ctx);
  try {
    ctx.body = await provisionClientPortal(ctx.app, {
      dealUuid: input.dealUuid,
      organisationUuid: input.organisationUuid,
      serviceType: input.serviceType,
      projectName: readString(input.values, 'projectName'),
      organisationName: readString(input.values, 'organisationName'),
      clientContactEmail: readString(input.values, 'clientContactEmail'),
      clientContactName: readString(input.values, 'clientContactName'),
    });
  } catch (err) {
    handleProvisioningError(ctx, err);
  }
  await next();
}
