/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { CollectionOptions } from '@nocobase/database';
import { COLLECTION, CRM_STAGES } from '../constants';
import { generateNTemplate } from '../locale';

/**
 * One phase of a track. `isGate` marks a client-approval checkpoint; `crmStage` is the deal
 * stage this phase implies, which is how the delivery pipeline stays in step with the CRM.
 */
export default {
  name: COLLECTION.trackPhases,
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
      name: 'track',
      type: 'belongsTo',
      target: COLLECTION.serviceTracks,
      foreignKey: 'trackId',
      targetKey: 'id',
    },
    {
      name: 'position',
      type: 'integer',
      allowNull: false,
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
      name: 'clientDescription',
      type: 'text',
      interface: 'textarea',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Client description'),
        'x-component': 'Input.TextArea',
      },
    },
    {
      name: 'isGate',
      type: 'boolean',
      allowNull: false,
      defaultValue: false,
    },
    {
      name: 'gateName',
      type: 'string',
      interface: 'input',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Gate name'),
        'x-component': 'Input',
      },
    },
    {
      name: 'crmStage',
      type: 'string',
      allowNull: false,
      interface: 'select',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('CRM stage'),
        'x-component': 'Select',
        enum: CRM_STAGES.map((value) => ({ value, label: generateNTemplate(value) })),
      },
    },
  ],
  indexes: [
    {
      unique: true,
      fields: ['trackId', 'position'],
    },
  ],
} as CollectionOptions;
