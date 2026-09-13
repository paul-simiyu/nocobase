/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { CollectionOptions } from '@nocobase/database';
import { COLLECTION } from '../constants';
import { generateNTemplate } from '../locale';

/**
 * The canonical organisation, synced from the CRM. Everything else — deal to project,
 * contact to workspace member — hangs off this UUID. Sync it before anything else, or
 * you are string-matching client names within months.
 */
export default {
  name: COLLECTION.organisations,
  dumpRules: {
    group: 'required',
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
      interface: 'input',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Organisation UUID'),
        'x-component': 'Input',
        'x-read-pretty': true,
      },
    },
    {
      name: 'name',
      type: 'string',
      allowNull: false,
      interface: 'input',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Name'),
        'x-component': 'Input',
      },
    },
    {
      name: 'primaryContactName',
      type: 'string',
      interface: 'input',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Primary contact name'),
        'x-component': 'Input',
      },
    },
    {
      name: 'primaryContactEmail',
      type: 'string',
      interface: 'input',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Primary contact email'),
        'x-component': 'Input',
      },
    },
    {
      name: 'syncedAt',
      type: 'date',
      interface: 'datetime',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Synced at'),
        'x-component': 'DatePicker',
        'x-read-pretty': true,
      },
    },
  ],
} as CollectionOptions;
