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
import { ocdsReleaseToNotice, readReleases } from './ocds';

const API = 'https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search';
const NOTICE_BASE = 'https://www.contractsfinder.service.gov.uk/Notice';
const PAGE_SIZE = 100;

export const cfNoticeUrl = (release: Record<string, unknown>): string | undefined => {
  for (const document of asArray(asRecord(release.tender)?.documents)) {
    const url = asString(asRecord(document)?.url);
    if (url) return url;
  }
  const id = asString(release.id) ?? asString(release.ocid);
  return id ? `${NOTICE_BASE}/${encodeURIComponent(id)}` : undefined;
};

/**
 * UK Contracts Finder - below-threshold and central-government contracts.
 *
 * @see https://www.contractsfinder.service.gov.uk/apidocumentation/Notices/1/GET-Published-Notice-OCDS-Search
 */
export const contractsFinderSource: SourceAdapter = {
  key: 'contracts-finder',
  label: 'Contracts Finder (UK)',
  docs: 'https://www.contractsfinder.service.gov.uk/apidocumentation/Notices/1/GET-Published-Notice-OCDS-Search',

  async fetchNotices({ since, limit }: HarvestOptions): Promise<RawNotice[]> {
    const notices: RawNotice[] = [];
    const size = Math.min(PAGE_SIZE, limit);

    for (let page = 1; notices.length < limit; page += 1) {
      const payload: unknown = await getJson(API, {
        params: { publishedFrom: since, stages: 'tender', orderBy: 'publishedDate', order: 'DESC', size, page },
      });
      const releases = readReleases(payload);
      if (!releases.length) break;

      for (const release of releases) {
        const notice = ocdsReleaseToNotice(release, { noticeUrl: cfNoticeUrl });
        if (notice) notices.push(notice);
        if (notices.length >= limit) break;
      }

      // A short page means there is nothing left to walk.
      if (releases.length < size) break;
    }

    return notices;
  },
};
