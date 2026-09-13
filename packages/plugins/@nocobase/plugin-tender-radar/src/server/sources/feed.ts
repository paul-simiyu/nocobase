/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * A deliberately small RSS/Atom reader.
 *
 * Procurement feeds are flat lists of items with a handful of well-known tags, so
 * a full XML parser would be a dependency bought for nothing. This handles the
 * subset those feeds actually use: CDATA, entities, and the RSS/Atom tag pairs.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  nbsp: ' ',
};

export function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z0-9#]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

const stripCdata = (value: string): string => value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, inner: string) => inner);

/** Feed descriptions carry escaped HTML; the extractor wants readable prose. */
export function stripHtml(value: string): string {
  return decodeEntities(
    stripCdata(value)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

const readTag = (xml: string, tag: string): string | undefined => {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(xml);
  if (!match) return undefined;
  const value = decodeEntities(stripCdata(match[1])).trim();
  return value === '' ? undefined : value;
};

/** Atom links carry the URL in an attribute rather than as element text. */
const readAtomLink = (xml: string): string | undefined => {
  const alternate = /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i.exec(xml);
  if (alternate) return decodeEntities(alternate[1]);
  const plain = /<link[^>]*href=["']([^"']+)["']/i.exec(xml);
  return plain ? decodeEntities(plain[1]) : undefined;
};

export interface FeedItem {
  id: string;
  title: string;
  link: string;
  description: string;
  publishedAt?: string;
}

const blocks = (xml: string, tag: string): string[] =>
  [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi'))].map((m) => m[1]);

const toIso = (value?: string): string | undefined => {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

/** Parses an RSS 2.0 or Atom document into flat items. Unparseable input yields []. */
export function parseFeed(xml: string): FeedItem[] {
  const entries = [...blocks(xml, 'item'), ...blocks(xml, 'entry')];

  return entries
    .map((entry) => {
      const title = readTag(entry, 'title');
      const link = readTag(entry, 'link') ?? readAtomLink(entry);
      if (!title || !link) return undefined;

      const rawDescription =
        readTag(entry, 'description') ?? readTag(entry, 'summary') ?? readTag(entry, 'content') ?? '';

      const item: FeedItem = {
        id: readTag(entry, 'guid') ?? readTag(entry, 'id') ?? link,
        title: stripHtml(title),
        link,
        description: stripHtml(rawDescription),
        publishedAt: toIso(readTag(entry, 'pubDate') ?? readTag(entry, 'published') ?? readTag(entry, 'updated')),
      };
      return item;
    })
    .filter((item): item is FeedItem => item !== undefined);
}
