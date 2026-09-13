/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { HarvestOptions, RawNotice, SourceAdapter } from '../../shared/types';
import { parseFeed } from './feed';
import { getText } from './http';

/**
 * Generic RSS/Atom source.
 *
 * Several development banks and UN agencies (UNDP, AfDB, UNGM among them) publish
 * procurement notices as a feed but offer no JSON API. Rather than hard-code URLs
 * that go stale, this adapter takes the feed URL from source config, so an
 * operator can add a portal without a code change.
 */
export const rssSource: SourceAdapter = {
  key: 'rss',
  label: 'RSS / Atom feed',
  docs: 'https://www.rssboard.org/rss-specification',
  requiredConfig: ['url'],

  async fetchNotices({ since, limit, config = {} }: HarvestOptions): Promise<RawNotice[]> {
    const url = config.url;
    if (!url) {
      throw new Error('The RSS source requires a "url" in its config.');
    }

    const xml = await getText(url);
    const sinceTime = new Date(since).getTime();

    return parseFeed(xml)
      .filter((item) => {
        // Feeds without dates are kept - de-duplication catches the repeats.
        if (!item.publishedAt) return true;
        return new Date(item.publishedAt).getTime() >= sinceTime;
      })
      .slice(0, limit)
      .map((item) => ({
        externalId: item.id,
        title: item.title,
        description: item.description,
        url: item.link,
        buyer: config.buyer,
        country: config.country,
        noticeType: 'feed',
        publishedAt: item.publishedAt,
        raw: { id: item.id, title: item.title, link: item.link, description: item.description },
      }));
  },
};
