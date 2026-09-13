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
 * A delivery project, created from a template when a deal is won. `trackVersion` pins the
 * track revision this project started on so a later revision cannot reshape it mid-flight.
 */
export default {
  name: COLLECTION.projects,
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
      name: 'organisationUuid',
      type: 'string',
      allowNull: false,
    },
    {
      name: 'dealUuid',
      type: 'string',
      allowNull: false,
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
      name: 'track',
      type: 'belongsTo',
      target: COLLECTION.serviceTracks,
      foreignKey: 'trackId',
      targetKey: 'id',
    },
    {
      name: 'trackVersion',
      type: 'integer',
      allowNull: false,
      defaultValue: 1,
    },
    {
      name: 'status',
      type: 'string',
      allowNull: false,
      defaultValue: 'active',
    },
    {
      name: 'portalEnabled',
      type: 'boolean',
      allowNull: false,
      defaultValue: false,
    },
    {
      name: 'portalPath',
      type: 'string',
    },
    {
      /** Only the hash is stored. The raw invite is returned once, at issue time. */
      name: 'inviteTokenHash',
      type: 'string',
    },
    {
      name: 'inviteIssuedAt',
      type: 'date',
    },
    {
      name: 'inviteExpiresAt',
      type: 'date',
    },
    {
      name: 'completedAt',
      type: 'date',
    },
    {
      name: 'phases',
      type: 'hasMany',
      target: COLLECTION.projectPhases,
      foreignKey: 'projectId',
      sourceKey: 'id',
    },
  ],
  indexes: [
    {
      // The idempotency guarantee: a deal reopened then re-won resumes this project rather
      // than spawning a second portal. One project per service on a multi-service deal.
      unique: true,
      fields: ['dealUuid', 'serviceType'],
    },
  ],
} as CollectionOptions;
