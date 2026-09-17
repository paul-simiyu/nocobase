/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { CollectionOptions } from '@nocobase/database';
import { generateNTemplate } from '../locale';

export default {
  name: 'tenderSources',
  title: generateNTemplate('Tender sources'),
  dumpRules: { group: 'third-party' },
  shared: true,
  fields: [
    { name: 'id', type: 'bigInt', autoIncrement: true, primaryKey: true, allowNull: false, interface: 'id' },
    {
      type: 'string',
      name: 'sourceKey',
      allowNull: false,
      interface: 'input',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Adapter'),
        'x-component': 'Input',
        description: generateNTemplate('One of the adapter keys registered by the plugin.'),
      },
    },
    {
      type: 'string',
      name: 'title',
      interface: 'input',
      uiSchema: { type: 'string', title: generateNTemplate('Title'), 'x-component': 'Input' },
    },
    {
      type: 'boolean',
      name: 'enabled',
      defaultValue: true,
      interface: 'checkbox',
      uiSchema: { type: 'boolean', title: generateNTemplate('Enabled'), 'x-component': 'Checkbox' },
    },
    /** Adapter-specific settings, e.g. `appname` for ReliefWeb or `url` for a feed. */
    {
      type: 'json',
      name: 'config',
      interface: 'json',
      defaultValue: {},
      uiSchema: { type: 'object', title: generateNTemplate('Config'), 'x-component': 'Input.JSON' },
    },
    {
      type: 'integer',
      name: 'lookbackDays',
      defaultValue: 30,
      interface: 'integer',
      uiSchema: {
        type: 'number',
        title: generateNTemplate('Lookback days'),
        'x-component': 'InputNumber',
        description: generateNTemplate('Used for the first harvest, before a last-run timestamp exists.'),
      },
    },
    {
      type: 'integer',
      name: 'limit',
      defaultValue: 200,
      interface: 'integer',
      uiSchema: { type: 'number', title: generateNTemplate('Notices per run'), 'x-component': 'InputNumber' },
    },
    {
      type: 'integer',
      name: 'minRelevance',
      interface: 'integer',
      uiSchema: {
        type: 'number',
        title: generateNTemplate('Minimum relevance'),
        'x-component': 'InputNumber',
        description: generateNTemplate('Leave empty to use the plugin default.'),
      },
    },
    {
      type: 'date',
      name: 'lastHarvestAt',
      interface: 'datetime',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Last harvest'),
        'x-component': 'DatePicker',
        'x-component-props': { showTime: true },
      },
    },
  ],
} as CollectionOptions;
