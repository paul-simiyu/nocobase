/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { HarvestOptions, RawNotice, SourceAdapter } from '../../shared/types';
import { getJson } from './http';
import { asArray, asRecord, firstString, toIsoDate, toJsonObject } from './json';

/**
 * The World Bank publishes procurement notices through its Data Catalog "DEX"
 * view service. The endpoint is overridable via source config so an operator can
 * repoint it if the Bank moves the dataset, without waiting on a code change.
 */
const DEFAULT_ENDPOINT = 'https://datacatalogapi.worldbank.org/dexapps/fone/api/view';
const DEFAULT_VIEW_ID = 'DS01595';
const NOTICE_FALLBACK = 'https://projects.worldbank.org/en/projects-operations/procurement-detail';
const PAGE_SIZE = 100;

/** The dataset has been served under `data`, `value` and `rows` at different times. */
const readRows = (payload: unknown): unknown[] => {
  const record = asRecord(payload);
  if (!record) return [];
  for (const key of ['data', 'value', 'rows', 'items']) {
    const rows = asArray(record[key]);
    if (rows.length) return rows;
  }
  return Array.isArray(payload) ? payload : [];
};

export function worldBankRowToNotice(row: unknown): RawNotice | undefined {
  const record = asRecord(row);
  if (!record) return undefined;

  const externalId = firstString(record, ['id', 'notice_id', 'noticeId', 'bid_reference_no']);
  const title = firstString(record, ['bid_description', 'notice_title', 'title', 'project_name']);
  if (!externalId || !title) return undefined;

  const url =
    firstString(record, ['url', 'notice_url', 'link']) ?? `${NOTICE_FALLBACK}/${encodeURIComponent(externalId)}`;

  return {
    externalId,
    title,
    description: firstString(record, ['bid_description', 'notice_text', 'description']) ?? '',
    url,
    buyer: firstString(record, ['project_name', 'borrower', 'agency', 'implementing_agency']),
    country: firstString(record, ['country_name', 'countryname', 'country']),
    noticeType: firstString(record, ['notice_type', 'noticetype', 'procurement_category']),
    publishedAt: toIsoDate(firstString(record, ['publication_date', 'noticedate', 'submission_date'])),
    deadlineAt: toIsoDate(firstString(record, ['deadline_date', 'submission_deadline_date', 'bid_deadline_date'])),
    raw: toJsonObject(record),
  };
}

/**
 * World Bank project procurement notices - a steady source of communications,
 * branding and campaign packages attached to Bank-financed programmes.
 *
 * @see https://financesone.worldbank.org/procurement-notices/DS01595
 */
export const worldBankSource: SourceAdapter = {
  key: 'world-bank',
  label: 'World Bank procurement notices',
  docs: 'https://financesone.worldbank.org/procurement-notices/DS01595',

  async fetchNotices({ limit, config = {} }: HarvestOptions): Promise<RawNotice[]> {
    const endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
    const viewId = config.viewId ?? DEFAULT_VIEW_ID;
    const notices: RawNotice[] = [];

    for (let skip = 0; notices.length < limit; skip += PAGE_SIZE) {
      const payload: unknown = await getJson(endpoint, {
        params: { viewId, top: Math.min(PAGE_SIZE, limit - notices.length), skip },
      });
      const rows = readRows(payload);
      if (!rows.length) break;

      for (const row of rows) {
        const notice = worldBankRowToNotice(row);
        if (notice) notices.push(notice);
        if (notices.length >= limit) break;
      }

      if (rows.length < PAGE_SIZE) break;
    }

    return notices;
  },
};
