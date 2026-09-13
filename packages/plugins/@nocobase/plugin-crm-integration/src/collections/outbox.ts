/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { CollectionOptions } from '@nocobase/database';
import { COLLECTION, OUTBOX_STATUS } from '../constants';
import { generateNTemplate } from '../locale';

/**
 * Events this app has produced but not yet handed to Redis. Writing the row in the same
 * transaction as the business change is what makes replay possible when Redis drops a message.
 */
export default {
  name: COLLECTION.outbox,
  dumpRules: {
    group: 'log',
  },
  shared: true,
  fields: [
    {
      name: 'id',
      type: 'bigInt',
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
      interface: 'id',
    },
    {
      name: 'uuid',
      type: 'uuid',
      allowNull: false,
      unique: true,
    },
    {
      name: 'eventName',
      type: 'string',
      allowNull: false,
      interface: 'input',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Event'),
        'x-component': 'Input',
        'x-read-pretty': true,
      },
    },
    {
      name: 'payload',
      type: 'json',
      defaultValue: {},
    },
    {
      name: 'origin',
      type: 'string',
      allowNull: false,
      defaultValue: 'system',
    },
    {
      name: 'depth',
      type: 'integer',
      allowNull: false,
      defaultValue: 0,
    },
    {
      name: 'status',
      type: 'string',
      allowNull: false,
      defaultValue: 'pending',
      interface: 'select',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Status'),
        'x-component': 'Select',
        enum: OUTBOX_STATUS.map((value) => ({ value, label: generateNTemplate(value) })),
      },
    },
    {
      name: 'attempts',
      type: 'integer',
      allowNull: false,
      defaultValue: 0,
    },
    {
      name: 'availableAt',
      type: 'date',
    },
    {
      name: 'publishedAt',
      type: 'date',
    },
    {
      name: 'streamMessageId',
      type: 'string',
    },
    {
      name: 'lastError',
      type: 'text',
    },
  ],
  indexes: [
    {
      fields: ['status', 'availableAt'],
    },
  ],
} as CollectionOptions;
