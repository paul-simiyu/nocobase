/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { SourceAdapter } from '../../shared/types';
import { contractsFinderSource } from './contracts-finder';
import { findATenderSource } from './find-a-tender';
import { reliefWebSource } from './reliefweb';
import { rssSource } from './rss';
import { tedSource } from './ted';
import { worldBankSource } from './world-bank';

export const SOURCE_ADAPTERS: SourceAdapter[] = [
  findATenderSource,
  contractsFinderSource,
  tedSource,
  worldBankSource,
  reliefWebSource,
  rssSource,
];

const BY_KEY = new Map(SOURCE_ADAPTERS.map((adapter) => [adapter.key, adapter]));

export const getAdapter = (key: string): SourceAdapter | undefined => BY_KEY.get(key);

/** Adapters that work out of the box, used to seed the source list on install. */
export const SELF_CONFIGURING_KEYS = SOURCE_ADAPTERS.filter((adapter) => !adapter.requiredConfig?.length).map(
  (adapter) => adapter.key,
);

export { contractsFinderSource, findATenderSource, reliefWebSource, rssSource, tedSource, worldBankSource };
