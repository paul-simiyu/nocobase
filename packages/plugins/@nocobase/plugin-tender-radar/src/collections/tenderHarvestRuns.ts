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

const counter = (name: string, title: string) => ({
  type: 'integer',
  name,
  defaultValue: 0,
  interface: 'integer',
  uiSchema: { type: 'number', title: generateNTemplate(title), 'x-component': 'InputNumber' },
});

export default {
  name: 'tenderHarvestRuns',
  title: generateNTemplate('Harvest runs'),
  dumpRules: { group: 'log' },
  shared: true,
  fields: [
    { name: 'id', type: 'bigInt', autoIncrement: true, primaryKey: true, allowNull: false, interface: 'id' },
    {
      type: 'string',
      name: 'sourceKey',
      interface: 'input',
      uiSchema: { type: 'string', title: generateNTemplate('Source key'), 'x-component': 'Input' },
    },
    {
      type: 'string',
      name: 'status',
      interface: 'select',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Status'),
        'x-component': 'Select',
        enum: [
          { label: generateNTemplate('Succeeded'), value: 'succeeded', color: 'green' },
          { label: generateNTemplate('Failed'), value: 'failed', color: 'red' },
        ],
      },
    },
    { type: 'date', name: 'startedAt', interface: 'datetime' },
    { type: 'date', name: 'finishedAt', interface: 'datetime' },
    counter('fetched', 'Fetched'),
    counter('created', 'Created'),
    counter('updated', 'Updated'),
    counter('skipped', 'Skipped (below relevance)'),
    {
      type: 'text',
      name: 'error',
      interface: 'textarea',
      uiSchema: { type: 'string', title: generateNTemplate('Error'), 'x-component': 'Input.TextArea' },
    },
  ],
} as CollectionOptions;
