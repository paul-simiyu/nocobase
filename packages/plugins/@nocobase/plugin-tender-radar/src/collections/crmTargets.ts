/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { CollectionOptions } from '@nocobase/database';
import { generateNTemplate } from '../locale';

const input = (name: string, title: string, description?: string) => ({
  type: 'string',
  name,
  interface: 'input',
  uiSchema: {
    type: 'string',
    title: generateNTemplate(title),
    'x-component': 'Input',
    ...(description ? { description: generateNTemplate(description) } : {}),
  },
});

export default {
  name: 'crmTargets',
  title: generateNTemplate('CRM targets'),
  dumpRules: { group: 'third-party' },
  shared: true,
  fields: [
    { name: 'id', type: 'bigInt', autoIncrement: true, primaryKey: true, allowNull: false, interface: 'id' },
    input('title', 'Title'),
    {
      type: 'boolean',
      name: 'enabled',
      defaultValue: true,
      interface: 'checkbox',
      uiSchema: { type: 'boolean', title: generateNTemplate('Enabled'), 'x-component': 'Checkbox' },
    },
    input('baseUrl', 'Base URL', 'Root of the CRM, for example https://crm.example.com'),
    input('leadPath', 'Create lead path', 'Path appended to the base URL to create a lead.'),
    /**
     * The credential is stored by reference, never by value: this holds the NAME
     * of an environment variable, and the token is resolved at request time. A
     * database dump of this collection therefore carries no secret.
     */
    input('tokenVariable', 'Token variable', 'Name of the environment variable holding the API token.'),
    input('authHeader', 'Auth header', 'Header carrying the token. Defaults to Authorization.'),
    input('authScheme', 'Auth scheme', 'Prefix before the token, such as Bearer. Leave empty to send it raw.'),
    input('idPath', 'Created id path', 'Dot path to the new lead id in the response, such as data.id.'),
    {
      type: 'json',
      name: 'fieldMap',
      interface: 'json',
      defaultValue: {},
      uiSchema: {
        type: 'object',
        title: generateNTemplate('Field map'),
        'x-component': 'Input.JSON',
        description: generateNTemplate('Maps canonical lead keys onto the column names your CRM uses.'),
      },
    },
    {
      type: 'json',
      name: 'defaultValues',
      interface: 'json',
      defaultValue: {},
      uiSchema: {
        type: 'object',
        title: generateNTemplate('Default values'),
        'x-component': 'Input.JSON',
        description: generateNTemplate('Sent with every lead, for example an owner or a pipeline stage.'),
      },
    },
  ],
} as CollectionOptions;
