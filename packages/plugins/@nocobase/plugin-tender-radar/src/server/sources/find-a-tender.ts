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
import { asArray, asRecord, asString } from './json';
import { ocdsReleaseToNotice, readNextLink, readReleases } from './ocds';

const API = 'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages';
const PAGE_SIZE = 100;

/** Find a Tender wants a naive timestamp - a trailing `Z` is rejected. */
export const toFtsTimestamp = (iso: string): string => new Date(iso).toISOString().slice(0, 19);

/**
 * OCDS does not standardise a human-facing notice URL. Find a Tender embeds one
 * in `tender.documents`, and the addressable API record is the reliable fallback.
 */
export const ftsNoticeUrl = (release: Record<string, unknown>): string | undefined => {
  for (const document of asArray(asRecord(release.tender)?.documents)) {
    const url = asString(asRecord(document)?.url);
    if (url) return url;
  }
  const ocid = asString(release.ocid) ?? asString(release.id);
  return ocid ? `${API}/${encodeURIComponent(ocid)}` : undefined;
};

/**
 * UK Find a Tender Service - above-threshold UK public procurement.
 *
 * @see https://www.find-tender.service.gov.uk/apidocumentation/1.0/GET-ocdsReleasePackages
 */
export const findATenderSource: SourceAdapter = {
  key: 'find-a-tender',
  label: 'Find a Tender (UK)',
  docs: 'https://www.find-tender.service.gov.uk/apidocumentation/1.0/GET-ocdsReleasePackages',

  async fetchNotices({ since, limit }: HarvestOptions): Promise<RawNotice[]> {
    const notices: RawNotice[] = [];
    let url: string | undefined = API;
    let params: Record<string, string | number> | undefined = {
      updatedFrom: toFtsTimestamp(since),
      limit: Math.min(PAGE_SIZE, limit),
      stages: 'tender',
    };

    while (url && notices.length < limit) {
      const payload: unknown = await getJson(url, { params });
      const releases = readReleases(payload);
      if (!releases.length) break;

      for (const release of releases) {
        const notice = ocdsReleaseToNotice(release, { noticeUrl: ftsNoticeUrl });
        if (notice) notices.push(notice);
        if (notices.length >= limit) break;
      }

      // `links.next` is absolute and already carries the query, so drop our params.
      url = readNextLink(payload);
      params = undefined;
    }

    return notices;
  },
};
