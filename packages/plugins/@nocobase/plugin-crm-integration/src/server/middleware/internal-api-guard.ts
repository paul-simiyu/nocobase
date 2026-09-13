/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Context, Next } from '@nocobase/actions';
import { timingSafeEqual } from 'crypto';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export const INTERNAL_TOKEN_ENV = 'CRM_INTEGRATION_INTERNAL_TOKEN';
export const INTERNAL_TOKEN_HEADER = 'x-internal-token';

function isLoopback(ctx: Context): boolean {
  const remote = ctx.req?.socket?.remoteAddress;
  if (remote && LOOPBACK.has(remote)) {
    return true;
  }
  return LOOPBACK.has(ctx.request?.ip ?? '');
}

function matches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Guards the internal actions API.
 *
 * Even sharing a server, neither app writes into the other's database: the CRM asks through
 * this narrow set of permitted actions, and this is the door. Two locks — the call has to
 * come from this host, and it has to carry the shared token. With no token configured the
 * door stays shut rather than swinging open.
 */
export async function internalApiGuard(ctx: Context, next: Next) {
  const expected = process.env[INTERNAL_TOKEN_ENV];
  if (!expected) {
    ctx.app.logger.error(`[crm-integration] ${INTERNAL_TOKEN_ENV} is not set, internal API refused the request`);
    return ctx.throw(503, 'internal API is not configured');
  }
  if (!isLoopback(ctx)) {
    ctx.app.logger.warn(`[crm-integration] internal API refused a non-local request`, {
      remoteAddress: ctx.req?.socket?.remoteAddress,
    });
    return ctx.throw(403, 'internal API is local only');
  }
  const provided = ctx.get(INTERNAL_TOKEN_HEADER);
  if (!provided || !matches(provided, expected)) {
    return ctx.throw(403, 'invalid internal token');
  }
  await next();
}
