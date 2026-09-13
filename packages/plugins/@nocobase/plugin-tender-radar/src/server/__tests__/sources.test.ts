/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

interface StubCall {
  method: 'get' | 'post';
  url: string;
  params?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

const { queue, calls } = vi.hoisted(() => ({ queue: [] as unknown[], calls: [] as StubCall[] }));

vi.mock('axios', () => {
  const respond = (
    method: 'get' | 'post',
    url: string,
    params?: Record<string, unknown>,
    body?: Record<string, unknown>,
  ) => {
    calls.push({ method, url, params, body });
    if (!queue.length) {
      return Promise.reject(new Error(`no queued response for ${method} ${url}`));
    }
    return Promise.resolve({ data: queue.shift() });
  };
  const client = {
    get: (url: string, cfg?: { params?: Record<string, unknown> }) => respond('get', url, cfg?.params),
    post: (url: string, body: Record<string, unknown>, cfg?: { params?: Record<string, unknown> }) =>
      respond('post', url, cfg?.params, body),
    isAxiosError: () => false,
  };
  return { default: client, isAxiosError: () => false };
});

const { contractsFinderSource } = await import('../sources/contracts-finder');
const { findATenderSource, toFtsTimestamp } = await import('../sources/find-a-tender');
const { buildTedQuery, flattenText, tedNoticeToRaw, tedSource } = await import('../sources/ted');
const { worldBankRowToNotice } = await import('../sources/world-bank');
const { reliefWebEntryToNotice, reliefWebSource } = await import('../sources/reliefweb');
const { rssSource } = await import('../sources/rss');
const { getAdapter, SELF_CONFIGURING_KEYS, SOURCE_ADAPTERS } = await import('../sources');

const SINCE = '2026-02-01T00:00:00.000Z';

const ocdsRelease = (ocid: string, title: string) => ({
  ocid,
  id: `${ocid}-1`,
  date: '2026-03-01T00:00:00Z',
  tag: ['tender'],
  buyer: { name: 'Arts Council', address: { countryName: 'United Kingdom' } },
  tender: {
    title,
    description: 'Closing date: 3 April 2026.',
    value: { amount: 250000, currency: 'GBP' },
    tenderPeriod: { endDate: '2026-04-03T12:00:00Z' },
    enquiryPeriod: { endDate: '2026-03-20T12:00:00Z' },
    items: [{ classification: { scheme: 'CPV', id: '79822500' } }],
    lots: [{ id: '1' }, { id: '2' }],
    documents: [{ url: 'https://www.find-tender.service.gov.uk/Notice/0001-2026' }],
  },
});

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

describe('the source registry', () => {
  it('registers every adapter under a unique key', () => {
    const keys = SOURCE_ADAPTERS.map((adapter) => adapter.key);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('find-a-tender');
    expect(keys).toContain('ted-eu');
  });

  it('marks only the adapters that need config as needing it', () => {
    expect(SELF_CONFIGURING_KEYS).not.toContain('reliefweb');
    expect(SELF_CONFIGURING_KEYS).not.toContain('rss');
    expect(getAdapter('reliefweb')?.requiredConfig).toEqual(['appname']);
  });

  it('returns undefined for an unknown key', () => {
    expect(getAdapter('nope')).toBeUndefined();
  });
});

describe('findATenderSource', () => {
  it('sends a naive timestamp, because a trailing Z is rejected', () => {
    expect(toFtsTimestamp('2026-02-01T00:00:00.000Z')).toBe('2026-02-01T00:00:00');
  });

  it('follows links.next and drops its own params on the second page', async () => {
    queue.push({
      releases: [ocdsRelease('ocds-a-1', 'Graphic Design Framework')],
      links: { next: 'https://fts/page-2' },
    });
    queue.push({ releases: [ocdsRelease('ocds-a-2', 'Brand Identity Services')] });

    const notices = await findATenderSource.fetchNotices({ since: SINCE, limit: 50 });

    expect(notices).toHaveLength(2);
    expect(calls[0].params).toMatchObject({ updatedFrom: '2026-02-01T00:00:00', stages: 'tender' });
    expect(calls[1].url).toBe('https://fts/page-2');
    expect(calls[1].params).toBeUndefined();
  });

  it('maps the OCDS release onto the notice fields', async () => {
    queue.push({ releases: [ocdsRelease('ocds-a-1', 'Graphic Design Framework')] });

    const [notice] = await findATenderSource.fetchNotices({ since: SINCE, limit: 50 });

    expect(notice).toMatchObject({
      externalId: 'ocds-a-1',
      title: 'Graphic Design Framework',
      url: 'https://www.find-tender.service.gov.uk/Notice/0001-2026',
      buyer: 'Arts Council',
      country: 'United Kingdom',
      deadlineAt: '2026-04-03T12:00:00.000Z',
      clarificationDeadlineAt: '2026-03-20T12:00:00.000Z',
      estimatedValue: 250000,
      currency: 'GBP',
      lotCount: 2,
      cpvCodes: ['79822500'],
    });
  });

  it('stops at the requested limit', async () => {
    queue.push({ releases: [ocdsRelease('a', 'A'), ocdsRelease('b', 'B'), ocdsRelease('c', 'C')] });

    expect(await findATenderSource.fetchNotices({ since: SINCE, limit: 2 })).toHaveLength(2);
  });

  it('stops when a page carries no releases', async () => {
    queue.push({ releases: [] });

    expect(await findATenderSource.fetchNotices({ since: SINCE, limit: 50 })).toEqual([]);
  });
});

describe('contractsFinderSource', () => {
  it('pages by number and stops on a short page', async () => {
    queue.push({ releases: [ocdsRelease('ocds-b-1', 'Advertising Campaign')] });

    const notices = await contractsFinderSource.fetchNotices({ since: SINCE, limit: 50 });

    expect(notices).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].params).toMatchObject({ page: 1, stages: 'tender', publishedFrom: SINCE });
  });
});

describe('tedSource', () => {
  it('builds an expert query filtered by creative CPV codes and the since date', () => {
    const query = buildTedQuery(SINCE);

    expect(query).toContain('classification-cpv IN (');
    expect(query).toContain('79822500');
    expect(query).toContain('publication-date >= 20260201');
  });

  it('flattens multilingual and array values to plain text', () => {
    expect(flattenText({ eng: ['Video Production'] })).toBe('Video Production');
    expect(flattenText(['a', 'b'])).toBe('a b');
    expect(flattenText(undefined)).toBeUndefined();
  });

  it('normalises an eForms notice', () => {
    const notice = tedNoticeToRaw({
      'publication-number': '123456-2026',
      'notice-title': { eng: ['Video Production'] },
      'description-lot': ['Motion graphics'],
      'buyer-name': { eng: ['EU Agency'] },
      'publication-date': '2026-03-02Z',
      'classification-cpv': ['92111000'],
    });

    expect(notice).toMatchObject({
      externalId: '123456-2026',
      title: 'Video Production',
      url: 'https://ted.europa.eu/en/notice/-/detail/123456-2026',
      buyer: 'EU Agency',
      cpvCodes: ['92111000'],
    });
  });

  it('skips a notice with no publication number', () => {
    expect(tedNoticeToRaw({ 'notice-title': 'Untitled' })).toBeUndefined();
  });

  it('follows the iteration token until it is absent', async () => {
    queue.push({ notices: [{ 'publication-number': '1-2026', 'notice-title': 'A' }], iterationNextToken: 'TOK' });
    queue.push({ notices: [{ 'publication-number': '2-2026', 'notice-title': 'B' }] });

    const notices = await tedSource.fetchNotices({ since: SINCE, limit: 50 });

    expect(notices).toHaveLength(2);
    expect(calls[1].body?.iterationNextToken).toBe('TOK');
  });
});

describe('worldBankRowToNotice', () => {
  it('reads the documented field names', () => {
    const notice = worldBankRowToNotice({
      id: '9001',
      bid_description: 'Communications and branding services',
      country_name: 'Kenya',
      notice_type: 'Request for Expression of Interest',
      publication_date: '2026-03-01',
      deadline_date: '2026-04-15',
      url: 'https://projects.worldbank.org/notice/9001',
    });

    expect(notice).toMatchObject({
      externalId: '9001',
      title: 'Communications and branding services',
      country: 'Kenya',
      deadlineAt: '2026-04-15T00:00:00.000Z',
    });
  });

  it('falls back to a constructed URL when none is published', () => {
    expect(worldBankRowToNotice({ id: '1', bid_description: 'x' })?.url).toContain('procurement-detail/1');
  });

  it('skips a row with no identifier', () => {
    expect(worldBankRowToNotice({ bid_description: 'x' })).toBeUndefined();
  });
});

describe('reliefWebSource', () => {
  it('refuses to run without the appname its terms of use require', async () => {
    await expect(reliefWebSource.fetchNotices({ since: SINCE, limit: 10 })).rejects.toThrow('appname');
  });

  it('normalises a report entry and strips body markup', () => {
    const notice = reliefWebEntryToNotice({
      id: '4321',
      fields: {
        title: 'Request for Proposals: Brand Identity',
        body: '<p>Closing date: 3 April 2026</p>',
        url: 'https://reliefweb.int/node/4321',
        source: [{ name: 'UNICEF' }],
        country: [{ name: 'Kenya' }],
        date: { created: '2026-03-01T00:00:00+00:00' },
      },
    });

    expect(notice).toMatchObject({
      externalId: '4321',
      buyer: 'UNICEF',
      country: 'Kenya',
      description: 'Closing date: 3 April 2026',
    });
  });
});

describe('rssSource', () => {
  it('requires a feed url', async () => {
    await expect(rssSource.fetchNotices({ since: SINCE, limit: 10 })).rejects.toThrow('url');
  });

  it('drops items published before the window but keeps undated ones', async () => {
    queue.push(`<rss><channel>
      <item><title>Old</title><link>https://x/1</link><pubDate>Mon, 01 Jan 2020 00:00:00 GMT</pubDate></item>
      <item><title>New</title><link>https://x/2</link><pubDate>Tue, 10 Mar 2026 00:00:00 GMT</pubDate></item>
      <item><title>Undated</title><link>https://x/3</link></item>
    </channel></rss>`);

    const notices = await rssSource.fetchNotices({ since: SINCE, limit: 10, config: { url: 'https://x/feed' } });

    expect(notices.map((n) => n.title)).toEqual(['New', 'Undated']);
  });
});
