/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { CollectionOptions } from '@nocobase/database';
import { COLLECTION, PHASE_STATUS } from '../constants';
import { generateNTemplate } from '../locale';

/**
 * A project's copy of one track phase. `awaitingClient` drives the portal header's
 * "awaiting you" slot: a gate flips it true when its milestone is put up for approval, and
 * the client's action flips it back.
 */
export default {
  name: COLLECTION.projectPhases,
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
    },
    {
      name: 'project',
      type: 'belongsTo',
      target: COLLECTION.projects,
      foreignKey: 'projectId',
      targetKey: 'id',
    },
    {
      name: 'phase',
      type: 'belongsTo',
      target: COLLECTION.trackPhases,
      foreignKey: 'phaseId',
      targetKey: 'id',
    },
    {
      name: 'position',
      type: 'integer',
      allowNull: false,
    },
    {
      name: 'status',
      type: 'string',
      allowNull: false,
      defaultValue: 'upcoming',
      interface: 'select',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Status'),
        'x-component': 'Select',
        enum: PHASE_STATUS.map((value) => ({ value, label: generateNTemplate(value) })),
      },
    },
    {
      name: 'awaitingClient',
      type: 'boolean',
      allowNull: false,
      defaultValue: false,
    },
    {
      name: 'revisionRound',
      type: 'integer',
      allowNull: false,
      defaultValue: 1,
    },
    {
      name: 'revisionLimit',
      type: 'integer',
      allowNull: false,
      defaultValue: 2,
    },
    {
      name: 'startedAt',
      type: 'date',
    },
    {
      name: 'completedAt',
      type: 'date',
    },
  ],
  indexes: [
    {
      unique: true,
      fields: ['projectId', 'phaseId'],
    },
  ],
} as CollectionOptions;
