/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { CollectionOptions } from '@nocobase/database';
import { COLLECTION, INBOX_STATUS } from '../constants';
import { generateNTemplate } from '../locale';

/**
 * Every event consumed from the CRM stream, claimed by UUID before it is handled. The unique
 * constraint is the idempotency guarantee: a redelivered message finds its own row and stops.
 */
export default {
  name: COLLECTION.inbox,
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
      name: 'eventUuid',
      type: 'string',
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
      name: 'source',
      type: 'string',
      allowNull: false,
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
      name: 'payload',
      type: 'json',
      defaultValue: {},
    },
    {
      name: 'status',
      type: 'string',
      allowNull: false,
      defaultValue: 'processing',
      interface: 'select',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Status'),
        'x-component': 'Select',
        enum: INBOX_STATUS.map((value) => ({ value, label: generateNTemplate(value) })),
      },
    },
    {
      name: 'attempts',
      type: 'integer',
      allowNull: false,
      defaultValue: 0,
    },
    {
      name: 'processedAt',
      type: 'date',
    },
    {
      name: 'lastError',
      type: 'text',
    },
  ],
  indexes: [
    {
      fields: ['status'],
    },
  ],
} as CollectionOptions;
