/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

export const NAMESPACE = '@nocobase/plugin-tender-radar';

export const TENDERS_COLLECTION = 'tenders';
export const TENDER_SOURCES_COLLECTION = 'tenderSources';
export const HARVEST_RUNS_COLLECTION = 'tenderHarvestRuns';

/**
 * Relevance below this score is treated as noise and is not persisted by a harvest.
 * Set just above the 25 that a title carrying only generic words like "design"
 * scores, so a notice needs at least one real creative signal to clear it.
 */
export const DEFAULT_MIN_RELEVANCE = 30;
