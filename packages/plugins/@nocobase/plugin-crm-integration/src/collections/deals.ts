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
 * The Workspace's read-model of a CRM deal. Never written back to the CRM database — the
 * ratchet compares against this copy and emits an event when it wants the deal moved.
 */
export default {
  name: COLLECTION.deals,
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
      type: 'string',
      allowNull: false,
      unique: true,
      interface: 'input',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Deal UUID'),
        'x-component': 'Input',
        'x-read-pretty': true,
      },
    },
    {
      name: 'organisationUuid',
      type: 'string',
      allowNull: false,
    },
    {
      name: 'name',
      type: 'string',
      interface: 'input',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Name'),
        'x-component': 'Input',
      },
    },
    {
      name: 'currentStage',
      type: 'string',
      allowNull: false,
      defaultValue: 'strategy',
      interface: 'select',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Current stage'),
        'x-component': 'Select',
        enum: CRM_STAGES.map((value) => ({ value, label: generateNTemplate(value) })),
      },
    },
    {
      /**
       * Set when a person moved the deal by hand. Automation then logs a conflict instead of
       * overwriting a deliberate human decision.
       */
      name: 'stageSetManually',
      type: 'boolean',
      allowNull: false,
      defaultValue: false,
    },
    {
      name: 'stageUpdatedAt',
      type: 'date',
    },
    {
      name: 'wonAt',
      type: 'date',
    },
    {
      name: 'conflictNote',
      type: 'text',
    },
    {
      name: 'conflictAt',
      type: 'date',
    },
  ],
} as CollectionOptions;
