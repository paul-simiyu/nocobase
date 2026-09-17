/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { RawNotice } from '../../shared/types';
import { asArray, asRecord, asString, digNumber, digString, toIsoDate, toJsonObject } from './json';

/**
 * Open Contracting Data Standard release reader.
 *
 * Both UK portals publish OCDS 1.1, so the same normaliser serves them; only the
 * notice URL differs, which each source supplies.
 *
 * @see https://standard.open-contracting.org/latest/en/schema/release/
 */

/** CPV codes can sit on the primary or an additional classification. */
const readCpvCodes = (tender: unknown): string[] => {
  const codes = new Set<string>();
  for (const item of asArray(asRecord(tender)?.items)) {
    const classifications = [asRecord(item)?.classification, ...asArray(asRecord(item)?.additionalClassifications)];
    for (const classification of classifications) {
      const record = asRecord(classification);
      if (!record) continue;
      const scheme = asString(record.scheme)?.toUpperCase();
      const id = asString(record.id);
      if (id && (scheme === undefined || scheme.startsWith('CPV'))) {
        codes.add(id);
      }
    }
  }
  return [...codes];
};

const readBuyerCountry = (release: unknown): string | undefined => {
  const direct = digString(release, 'buyer', 'address', 'countryName');
  if (direct) return direct;
  for (const party of asArray(asRecord(release)?.parties)) {
    const country = digString(party, 'address', 'countryName');
    if (country) return country;
  }
  return undefined;
};

export interface OcdsReadOptions {
  /** Builds the public notice URL, which OCDS itself does not standardise. */
  noticeUrl: (release: Record<string, unknown>) => string | undefined;
}

/** Converts one OCDS release into a notice, or `undefined` if it carries no tender. */
export function ocdsReleaseToNotice(release: unknown, options: OcdsReadOptions): RawNotice | undefined {
  const record = asRecord(release);
  if (!record) return undefined;

  const tender = asRecord(record.tender);
  const title = asString(tender?.title) ?? asString(record.title);
  const externalId = asString(record.ocid) ?? asString(record.id);
  if (!title || !externalId) return undefined;

  const url = options.noticeUrl(record);
  if (!url) return undefined;

  return {
    externalId,
    title,
    description: asString(tender?.description) ?? '',
    url,
    buyer: digString(record, 'buyer', 'name'),
    country: readBuyerCountry(record),
    noticeType:
      asString(tender?.mainProcurementCategory) ??
      asArray(record.tag).filter((t): t is string => typeof t === 'string')[0],
    publishedAt: toIsoDate(record.date),
    deadlineAt: toIsoDate(digString(record, 'tender', 'tenderPeriod', 'endDate')),
    clarificationDeadlineAt: toIsoDate(digString(record, 'tender', 'enquiryPeriod', 'endDate')),
    estimatedValue: digNumber(record, 'tender', 'value', 'amount'),
    currency: digString(record, 'tender', 'value', 'currency'),
    cpvCodes: readCpvCodes(tender),
    lotCount: asArray(tender?.lots).length || undefined,
    raw: toJsonObject(record),
  };
}

/** Pulls the releases array out of an OCDS release package. */
export const readReleases = (payload: unknown): unknown[] => asArray(asRecord(payload)?.releases);

/** The absolute URL of the next page, when the publisher paginates by link. */
export const readNextLink = (payload: unknown): string | undefined => digString(payload, 'links', 'next');
