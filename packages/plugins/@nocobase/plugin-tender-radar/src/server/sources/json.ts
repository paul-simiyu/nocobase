/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { JsonObject } from '../../shared/types';

/**
 * Narrowing readers for third-party procurement payloads.
 *
 * Portal APIs change field shapes without notice, so every access goes through a
 * guard that returns `undefined` instead of throwing on an unexpected type.
 */

export const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

export const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

export const asNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

export const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Walks a nested path, yielding `undefined` the moment any segment is missing. */
export const dig = (root: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((acc, key) => asRecord(acc)?.[key], root);

export const digString = (root: unknown, ...path: string[]): string | undefined => asString(dig(root, ...path));

export const digNumber = (root: unknown, ...path: string[]): number | undefined => asNumber(dig(root, ...path));

/** First readable string among several candidate keys, for shape-drifting APIs. */
export const firstString = (record: Record<string, unknown> | undefined, keys: string[]): string | undefined => {
  if (!record) return undefined;
  for (const key of keys) {
    const value = asString(record[key]);
    if (value !== undefined) return value;
  }
  return undefined;
};

/** Normalises a date-ish value to a UTC ISO string, or `undefined` if unparseable. */
export const toIsoDate = (value: unknown): string | undefined => {
  const raw = asString(value) ?? (typeof value === 'number' ? String(value) : undefined);
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const year = parsed.getUTCFullYear();
  return year >= 1990 && year <= 2100 ? parsed.toISOString() : undefined;
};

/** Keeps the original payload for audit, discarding anything not JSON-serialisable. */
export const toJsonObject = (value: unknown): JsonObject => {
  const record = asRecord(value);
  if (!record) return {};
  try {
    return JSON.parse(JSON.stringify(record)) as JsonObject;
  } catch {
    return {};
  }
};
