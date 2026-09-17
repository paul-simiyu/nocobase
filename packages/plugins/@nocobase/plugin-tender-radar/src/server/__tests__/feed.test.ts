/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import { decodeEntities, parseFeed, stripHtml } from '../sources/feed';

describe('decodeEntities', () => {
  it('decodes named, decimal and hex entities', () => {
    expect(decodeEntities('Brand &amp; Design')).toBe('Brand & Design');
    expect(decodeEntities('&#39;quoted&#39;')).toBe("'quoted'");
    expect(decodeEntities('&#x2014;')).toBe('—');
  });

  it('leaves unknown entities alone', () => {
    expect(decodeEntities('&notanentity;')).toBe('&notanentity;');
  });
});

describe('stripHtml', () => {
  it('turns block markup into line breaks and drops tags', () => {
    expect(stripHtml('<p>Closing date: 3 April 2026</p><p>Bid security required.</p>')).toBe(
      'Closing date: 3 April 2026\nBid security required.',
    );
  });

  it('unwraps CDATA', () => {
    expect(stripHtml('<![CDATA[Plain text]]>')).toBe('Plain text');
  });
});

describe('parseFeed', () => {
  const rss = `<?xml version="1.0"?><rss version="2.0"><channel>
    <item>
      <title><![CDATA[Branding &amp; Design Services]]></title>
      <link>https://example.org/n/1</link>
      <guid>NOTICE-1</guid>
      <pubDate>Mon, 02 Mar 2026 10:00:00 GMT</pubDate>
      <description>&lt;p&gt;Closing date: 3 April 2026&lt;/p&gt;</description>
    </item>
  </channel></rss>`;

  const atom = `<feed xmlns="http://www.w3.org/2005/Atom">
    <entry>
      <title>Video Production Tender</title>
      <link rel="alternate" href="https://example.org/n/2"/>
      <id>urn:uuid:2</id>
      <updated>2026-03-05T09:00:00Z</updated>
      <summary>Motion graphics required.</summary>
    </entry>
  </feed>`;

  it('reads RSS items, decoding the title and escaped body', () => {
    const [item] = parseFeed(rss);

    expect(item).toEqual({
      id: 'NOTICE-1',
      title: 'Branding & Design Services',
      link: 'https://example.org/n/1',
      description: 'Closing date: 3 April 2026',
      publishedAt: '2026-03-02T10:00:00.000Z',
    });
  });

  it('reads Atom entries, taking the link from its href attribute', () => {
    const [item] = parseFeed(atom);

    expect(item.link).toBe('https://example.org/n/2');
    expect(item.publishedAt).toBe('2026-03-05T09:00:00.000Z');
  });

  it('falls back to the link when no guid is published', () => {
    const [item] = parseFeed(
      '<rss><channel><item><title>T</title><link>https://example.org/n/3</link></item></channel></rss>',
    );

    expect(item.id).toBe('https://example.org/n/3');
  });

  it('skips items without a title or link, and tolerates junk input', () => {
    expect(parseFeed('<rss><channel><item><title>No link</title></item></channel></rss>')).toEqual([]);
    expect(parseFeed('not xml at all')).toEqual([]);
  });
});
