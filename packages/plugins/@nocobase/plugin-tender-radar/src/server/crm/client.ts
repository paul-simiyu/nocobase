/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { JsonValue } from '../../shared/types';
import { postJson } from '../sources/http';
import { buildAuthHeaders, type CrmTargetRow, readCreatedId, resolveLeadUrl } from './target';

/**
 * Creates one lead in the target CRM and returns its id.
 *
 * The id may legitimately be absent - some CRMs answer 201 with an empty body -
 * so callers treat `undefined` as "sent, id unknown" rather than as a failure.
 */
export async function createLead(
  target: CrmTargetRow,
  payload: Record<string, JsonValue>,
  token: string,
): Promise<{ id?: string; response: unknown }> {
  const url = resolveLeadUrl(target);
  const response = await postJson(url, payload, { headers: buildAuthHeaders(target, token) });
  return { id: readCreatedId(response, target.idPath?.trim() || undefined), response };
}
