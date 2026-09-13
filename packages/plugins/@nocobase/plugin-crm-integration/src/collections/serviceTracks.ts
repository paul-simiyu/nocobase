/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { CollectionOptions } from '@nocobase/database';
import { COLLECTION, SERVICE_TYPES } from '../constants';
import { generateNTemplate } from '../locale';

/**
 * A versioned phase track per service. Version it: when the Web track is revised, in-flight
 * projects must keep rendering the version they started on.
 */
export default {
  name: COLLECTION.serviceTracks,
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
      name: 'serviceType',
      type: 'string',
      allowNull: false,
      interface: 'select',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Service type'),
        'x-component': 'Select',
        enum: SERVICE_TYPES.map((value) => ({ value, label: generateNTemplate(value) })),
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
      name: 'version',
      type: 'integer',
      allowNull: false,
      defaultValue: 1,
    },
    {
      name: 'isCurrent',
      type: 'boolean',
      allowNull: false,
      defaultValue: true,
    },
    {
      name: 'phases',
      type: 'hasMany',
      target: COLLECTION.trackPhases,
      foreignKey: 'trackId',
      sourceKey: 'id',
    },
  ],
  indexes: [
    {
      unique: true,
      fields: ['serviceType', 'version'],
    },
  ],
} as CollectionOptions;
