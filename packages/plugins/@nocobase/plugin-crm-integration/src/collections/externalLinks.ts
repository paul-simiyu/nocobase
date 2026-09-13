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
 * Separate databases mean no foreign keys, so both sides keep a link table instead.
 * A row says: "our <localType> #<localId> is the CRM's <remoteUuid>".
 */
export default {
  name: COLLECTION.externalLinks,
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
      name: 'localType',
      type: 'string',
      allowNull: false,
      interface: 'input',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Local type'),
        'x-component': 'Input',
      },
    },
    {
      name: 'localId',
      type: 'string',
      allowNull: false,
      interface: 'input',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Local ID'),
        'x-component': 'Input',
      },
    },
    {
      name: 'remoteSystem',
      type: 'string',
      allowNull: false,
      interface: 'input',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Remote system'),
        'x-component': 'Input',
      },
    },
    {
      name: 'remoteUuid',
      type: 'string',
      allowNull: false,
      interface: 'input',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Remote UUID'),
        'x-component': 'Input',
      },
    },
  ],
  indexes: [
    {
      // One local record maps to a given remote system once.
      unique: true,
      fields: ['localType', 'localId', 'remoteSystem'],
    },
    {
      // Reverse lookup. Not unique: a multi-service deal has one project per track.
      fields: ['remoteSystem', 'remoteUuid'],
    },
  ],
} as CollectionOptions;
