/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { HarvestOptions, RawNotice, SourceAdapter } from '../../shared/types';
import { postJson } from './http';
import { asArray, asRecord, asString, digString, toIsoDate, toJsonObject } from './json';
import { stripHtml } from './feed';

const API = 'https://api.reliefweb.int/v2/reports';
const PAGE_SIZE = 100;

/**
 * ReliefWeb carries NGO and UN agency procurement notices as reports rather than
 * in a dedicated tender feed, so the source is reached by text query.
 */
export const RELIEFWEB_QUERY =
  '("request for proposals" OR "invitation to tender" OR "expression of interest" OR "call for proposals") ' +
  'AND (branding OR "graphic design" OR "video production" OR "communications strategy" OR advertising OR "visual identity")';

const readCountry = (fields: Record<string, unknown>): string | undefined => {
  const first = asArray(fields.country)[0];
  return digString(first, 'name');
};

export function reliefWebEntryToNotice(entry: unknown): RawNotice | undefined {
  const record = asRecord(entry);
  const fields = asRecord(record?.fields);
  if (!record || !fields) return undefined;

  const externalId = asString(record.id) ?? asString(fields.id);
  const title = asString(fields.title);
  const url = asString(fields.url) ?? asString(fields['url_alias']);
  if (!externalId || !title || !url) return undefined;

  return {
    externalId,
    title,
    description: stripHtml(asString(fields.body) ?? ''),
    url,
    buyer: digString(asArray(fields.source)[0], 'name'),
    country: readCountry(fields),
    noticeType: 'report',
    publishedAt: toIsoDate(digString(fields, 'date', 'created')),
    raw: toJsonObject(record),
  };
}

/**
 * ReliefWeb - the humanitarian sector's notice board, run by UN OCHA.
 *
 * Requires an `appname` identifying the caller, per ReliefWeb's terms of use.
 *
 * @see https://apidoc.reliefweb.int/
 */
export const reliefWebSource: SourceAdapter = {
  key: 'reliefweb',
  label: 'ReliefWeb (NGO / UN)',
  docs: 'https://apidoc.reliefweb.int/',
  requiredConfig: ['appname'],

  async fetchNotices({ since, limit, config = {} }: HarvestOptions): Promise<RawNotice[]> {
    const appname = config.appname;
    if (!appname) {
      throw new Error('ReliefWeb requires an "appname" in the source config, per its terms of use.');
    }

    const notices: RawNotice[] = [];

    for (let offset = 0; notices.length < limit; offset += PAGE_SIZE) {
      const payload: unknown = await postJson(
        API,
        {
          query: { value: RELIEFWEB_QUERY, fields: ['title', 'body'], operator: 'AND' },
          filter: { field: 'date.created', value: { from: since } },
          fields: { include: ['id', 'title', 'body', 'url', 'source.name', 'country.name', 'date.created'] },
          limit: Math.min(PAGE_SIZE, limit - notices.length),
          offset,
          sort: ['date.created:desc'],
        },
        { params: { appname } },
      );

      const entries = asArray(asRecord(payload)?.data);
      if (!entries.length) break;

      for (const entry of entries) {
        const notice = reliefWebEntryToNotice(entry);
        if (notice) notices.push(notice);
        if (notices.length >= limit) break;
      }

      if (entries.length < PAGE_SIZE) break;
    }

    return notices;
  },
};
