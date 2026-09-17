/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { CrmFieldMap } from '../../shared/crmLead';
import type { JsonValue } from '../../shared/types';

/** A configured CRM destination, as stored in the `crmTargets` collection. */
export interface CrmTargetRow {
  id: number | string;
  title?: string | null;
  enabled?: boolean;
  baseUrl?: string | null;
  leadPath?: string | null;
  /** Name of the environment variable holding the token - never the token. */
  tokenVariable?: string | null;
  authHeader?: string | null;
  authScheme?: string | null;
  idPath?: string | null;
  fieldMap?: Record<string, string> | null;
  defaultValues?: Record<string, JsonValue> | null;
}

/**
 * Defaults target a NocoBase-hosted CRM running the CRM 2.0 solution, whose
 * leads live in `nb_crm_leads`. Every one of them is overridable per target, so
 * a different CRM needs a config row rather than a code change.
 */
export const CRM_DEFAULTS = {
  leadPath: '/api/nb_crm_leads:create',
  authHeader: 'Authorization',
  authScheme: 'Bearer',
  idPath: 'data.id',
} as const;

export const joinUrl = (baseUrl: string, path: string): string =>
  `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;

/** Full URL the lead is POSTed to. */
export function resolveLeadUrl(target: CrmTargetRow): string {
  const baseUrl = target.baseUrl?.trim();
  if (!baseUrl) {
    throw new Error('The CRM target has no base URL.');
  }
  return joinUrl(baseUrl, target.leadPath?.trim() || CRM_DEFAULTS.leadPath);
}

/**
 * Resolves the API token from the environment by the name the target stores.
 *
 * Checks NocoBase environment variables first, then `process.env`, so the token
 * can be managed in the UI or injected by the container.
 */
export function resolveToken(target: CrmTargetRow, variables: Record<string, unknown>): string {
  const name = target.tokenVariable?.trim();
  if (!name) {
    throw new Error('The CRM target names no token variable.');
  }
  const value = variables[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Environment variable "${name}" is not set, so the CRM request cannot be authenticated.`);
  }
  return value.trim();
}

export function buildAuthHeaders(target: CrmTargetRow, token: string): Record<string, string> {
  const header = target.authHeader?.trim() || CRM_DEFAULTS.authHeader;
  const scheme =
    target.authScheme === null || target.authScheme === undefined ? CRM_DEFAULTS.authScheme : target.authScheme.trim();
  return { [header]: scheme ? `${scheme} ${token}` : token };
}

/** Reads a dot path out of a response body, e.g. `data.id`. */
export function readPath(source: unknown, path: string): unknown {
  return path
    .split('.')
    .filter(Boolean)
    .reduce<unknown>(
      (acc, key) => (typeof acc === 'object' && acc !== null ? (acc as Record<string, unknown>)[key] : undefined),
      source,
    );
}

/**
 * Pulls the created lead id out of the response.
 *
 * Numbers are stringified because CRMs disagree about whether an id is a number
 * or a string, and the tender stores it as text either way.
 */
export function readCreatedId(response: unknown, idPath: string = CRM_DEFAULTS.idPath): string | undefined {
  const value = readPath(response, idPath);
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

export const readFieldMap = (target: CrmTargetRow): CrmFieldMap | undefined => {
  const map = target.fieldMap;
  if (!map || typeof map !== 'object' || Array.isArray(map)) return undefined;
  const entries = Object.entries(map).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim() !== '',
  );
  return entries.length ? (Object.fromEntries(entries) as CrmFieldMap) : undefined;
};
