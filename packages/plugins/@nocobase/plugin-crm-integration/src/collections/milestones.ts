/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { CollectionOptions } from '@nocobase/database';
import { COLLECTION, MILESTONE_STATE } from '../constants';
import { generateNTemplate } from '../locale';

/**
 * Client-facing checkpoints. Tasks are internal work units and roll up into a milestone;
 * the client only ever sees the milestone. That is what keeps delivery mess private while
 * the portal still feels live.
 */
export default {
  name: COLLECTION.milestones,
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
      name: 'projectPhase',
      type: 'belongsTo',
      target: COLLECTION.projectPhases,
      foreignKey: 'projectPhaseId',
      targetKey: 'id',
    },
    {
      /** Named plainly for the client — "Logo direction — Route B", never "Milestone 3". */
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
      name: 'state',
      type: 'string',
      allowNull: false,
      defaultValue: 'upcoming',
      interface: 'select',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('State'),
        'x-component': 'Select',
        enum: MILESTONE_STATE.map((value) => ({ value, label: generateNTemplate(value) })),
      },
    },
    {
      name: 'clientVisible',
      type: 'boolean',
      allowNull: false,
      defaultValue: true,
    },
    {
      name: 'dueAt',
      type: 'date',
    },
  ],
} as CollectionOptions;
