/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { CollectionOptions } from '@nocobase/database';
import { APPROVAL_ACTIONS, COLLECTION } from '../constants';
import { generateNTemplate } from '../locale';

/**
 * A signed delivery receipt: a named person, against a specific parcel, at a specific time.
 * Records are immutable — a change of mind is a new approval that references the original
 * through `supersedesId`, never an edit.
 */
export default {
  name: COLLECTION.approvals,
  dumpRules: {
    group: 'required',
  },
  shared: true,
  createdAt: true,
  updatedAt: false,
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
      name: 'projectPhase',
      type: 'belongsTo',
      target: COLLECTION.projectPhases,
      foreignKey: 'projectPhaseId',
      targetKey: 'id',
    },
    {
      name: 'approvedByUser',
      type: 'belongsTo',
      target: 'users',
      foreignKey: 'approvedByUserId',
      targetKey: 'id',
    },
    {
      /** Captured at the time of approval, so a later rename cannot rewrite the receipt. */
      name: 'approvedByName',
      type: 'string',
      allowNull: false,
      interface: 'input',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Approved by'),
        'x-component': 'Input',
        'x-read-pretty': true,
      },
    },
    {
      name: 'approvedAt',
      type: 'date',
      allowNull: false,
    },
    {
      name: 'action',
      type: 'string',
      allowNull: false,
      interface: 'select',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Action'),
        'x-component': 'Select',
        enum: APPROVAL_ACTIONS.map((value) => ({ value, label: generateNTemplate(value) })),
      },
    },
    {
      name: 'conditionsText',
      type: 'text',
      interface: 'textarea',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Conditions'),
        'x-component': 'Input.TextArea',
        'x-read-pretty': true,
      },
    },
    {
      name: 'revisionRound',
      type: 'integer',
      allowNull: false,
      defaultValue: 1,
    },
    {
      /** File UUIDs plus version labels — approving these specific versions, not "the files". */
      name: 'artifactSnapshot',
      type: 'json',
      defaultValue: [],
    },
    {
      name: 'ipAddress',
      type: 'string',
    },
    {
      name: 'portalVersion',
      type: 'string',
    },
    {
      /** A double-click must not double-fire. */
      name: 'idempotencyKey',
      type: 'string',
      allowNull: false,
      unique: true,
    },
    {
      name: 'supersedes',
      type: 'belongsTo',
      target: COLLECTION.approvals,
      foreignKey: 'supersedesId',
      targetKey: 'id',
    },
  ],
  indexes: [
    {
      fields: ['projectPhaseId'],
    },
  ],
} as CollectionOptions;
