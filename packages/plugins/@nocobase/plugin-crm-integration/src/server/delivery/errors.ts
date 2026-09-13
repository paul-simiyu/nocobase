/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

export type DeliveryErrorCode =
  | 'name-required'
  | 'idempotency-required'
  | 'phase-not-found'
  | 'not-a-gate'
  | 'gate-needs-approval'
  | 'already-closed'
  | 'not-attached'
  | 'supersedes-not-found';

/**
 * Raised for anything a caller could have got wrong; surfaced as a 400, not a 500. The code
 * is what the portal translates — the message is for logs and internal callers.
 */
export class DeliveryError extends Error {
  constructor(
    message: string,
    readonly code: DeliveryErrorCode,
  ) {
    super(message);
  }
}
