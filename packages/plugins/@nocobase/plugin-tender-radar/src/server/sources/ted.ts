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
import { asArray, asRecord, asString, toIsoDate, toJsonObject } from './json';

const API = 'https://api.ted.europa.eu/v3/notices/search';
const NOTICE_BASE = 'https://ted.europa.eu/en/notice/-/detail';
const PAGE_SIZE = 100;

/**
 * CPV codes covering creative-agency work. Filtering server-side keeps the
 * response small - TED publishes thousands of notices a day across all sectors.
 */
const CREATIVE_CPV = [
  '22000000', // printed matter
  '72413000', // www site design services
  '79340000', // advertising and marketing services
  '79341000', // advertising services
  '79341400', // advertising campaign services
  '79342000', // marketing services
  '79342200', // promotional services
  '79416000', // public relations services
  '79821000', // print finishing services
  '79822500', // graphic design services
  '79930000', // specialty design services
  '79952000', // event services
  '92111000', // motion picture and video production
  '92112000', // services related to motion picture and video production
];

/** TED expert-search compares dates as bare `YYYYMMDD`. */
export const toTedDate = (iso: string): string => new Date(iso).toISOString().slice(0, 10).replace(/-/g, '');

export const buildTedQuery = (since: string): string =>
  `classification-cpv IN (${CREATIVE_CPV.join(' ')}) AND publication-date >= ${toTedDate(since)}`;

/**
 * TED returns eForms values as arrays, and multilingual values keyed by language.
 * Flattening to plain text keeps the downstream extractor simple.
 */
export function flattenText(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (Array.isArray(value)) {
    const parts = value.map(flattenText).filter((part): part is string => part !== undefined);
    return parts.length ? parts.join(' ') : undefined;
  }
  const record = asRecord(value);
  if (record) {
    const preferred = record.eng ?? record.en ?? Object.values(record)[0];
    return flattenText(preferred);
  }
  return undefined;
}

const readField = (notice: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = flattenText(notice[key]);
    if (value !== undefined) return value;
  }
  return undefined;
};

const readCpv = (notice: Record<string, unknown>): string[] => {
  const raw = notice['classification-cpv'];
  if (typeof raw === 'string') return [raw];
  return asArray(raw)
    .map((entry) => flattenText(entry))
    .filter((entry): entry is string => entry !== undefined);
};

export function tedNoticeToRaw(entry: unknown): RawNotice | undefined {
  const notice = asRecord(entry);
  if (!notice) return undefined;

  const externalId = readField(notice, ['publication-number', 'ND', 'noticePublicationNumber']);
  const title = readField(notice, ['notice-title', 'title-proc', 'TI']);
  if (!externalId || !title) return undefined;

  return {
    externalId,
    title,
    description: readField(notice, ['description-lot', 'description-proc', 'notice-description']) ?? '',
    url: `${NOTICE_BASE}/${encodeURIComponent(externalId)}`,
    buyer: readField(notice, ['buyer-name', 'organisation-name-buyer']),
    country: readField(notice, ['place-of-performance-country-lot', 'country-buyer', 'CY']),
    noticeType: readField(notice, ['notice-type', 'form-type']),
    publishedAt: toIsoDate(readField(notice, ['publication-date', 'PD'])),
    deadlineAt: toIsoDate(
      readField(notice, ['deadline-receipt-tender-date-lot', 'deadline-receipt-request-date-lot', 'DT']),
    ),
    cpvCodes: readCpv(notice),
    raw: toJsonObject(notice),
  };
}

/**
 * Tenders Electronic Daily - EU-wide above-threshold procurement. No key needed.
 *
 * @see https://docs.ted.europa.eu/api/latest/search.html
 */
export const tedSource: SourceAdapter = {
  key: 'ted-eu',
  label: 'TED (EU)',
  docs: 'https://docs.ted.europa.eu/api/latest/search.html',

  async fetchNotices({ since, limit }: HarvestOptions): Promise<RawNotice[]> {
    const notices: RawNotice[] = [];
    let iterationNextToken: string | undefined;

    while (notices.length < limit) {
      const payload: unknown = await postJson(API, {
        query: buildTedQuery(since),
        fields: [
          'publication-number',
          'notice-title',
          'description-lot',
          'buyer-name',
          'publication-date',
          'deadline-receipt-tender-date-lot',
          'classification-cpv',
          'place-of-performance-country-lot',
        ],
        limit: Math.min(PAGE_SIZE, limit - notices.length),
        paginationMode: 'ITERATION',
        ...(iterationNextToken ? { iterationNextToken } : {}),
      });

      const entries = asArray(asRecord(payload)?.notices);
      if (!entries.length) break;

      for (const entry of entries) {
        const notice = tedNoticeToRaw(entry);
        if (notice) notices.push(notice);
        if (notices.length >= limit) break;
      }

      iterationNextToken = asString(asRecord(payload)?.iterationNextToken);
      if (!iterationNextToken) break;
    }

    return notices;
  },
};
