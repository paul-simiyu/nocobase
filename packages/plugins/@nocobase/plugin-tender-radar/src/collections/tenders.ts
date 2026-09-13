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

const text = (name: string, title: string, component = 'Input') => ({
  type: 'string',
  name,
  interface: component === 'Input.TextArea' ? 'textarea' : 'input',
  uiSchema: { type: 'string', title: generateNTemplate(title), 'x-component': component },
});

const datetime = (name: string, title: string) => ({
  type: 'date',
  name,
  interface: 'datetime',
  uiSchema: {
    type: 'string',
    title: generateNTemplate(title),
    'x-component': 'DatePicker',
    'x-component-props': { showTime: true },
  },
});

export default {
  name: 'tenders',
  title: generateNTemplate('Tenders'),
  dumpRules: { group: 'third-party' },
  shared: true,
  logging: true,
  fields: [
    { name: 'id', type: 'bigInt', autoIncrement: true, primaryKey: true, allowNull: false, interface: 'id' },
    /**
     * `sourceKey:externalId`. A unique index here is what makes a re-harvest
     * idempotent, rather than relying on the application to check first.
     */
    { type: 'string', name: 'dedupeKey', unique: true, allowNull: false, hidden: true },
    text('sourceKey', 'Source key'),
    text('sourceName', 'Source'),
    text('externalId', 'Notice reference'),
    text('title', 'Title'),
    text('buyer', 'Buyer'),
    text('country', 'Country'),
    {
      type: 'string',
      name: 'url',
      interface: 'url',
      uiSchema: { type: 'string', title: generateNTemplate('Notice URL'), 'x-component': 'Input.URL' },
    },
    {
      type: 'text',
      name: 'description',
      interface: 'textarea',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Description'),
        'x-component': 'Input.TextArea',
      },
    },
    text('noticeType', 'Notice type'),
    datetime('publishedAt', 'Published at'),
    datetime('deadlineAt', 'Submission deadline'),
    datetime('clarificationDeadlineAt', 'Clarifications close'),
    {
      type: 'double',
      name: 'estimatedValue',
      interface: 'number',
      uiSchema: { type: 'number', title: generateNTemplate('Estimated value'), 'x-component': 'InputNumber' },
    },
    text('currency', 'Currency'),
    {
      type: 'integer',
      name: 'lotCount',
      interface: 'integer',
      uiSchema: { type: 'number', title: generateNTemplate('Lots'), 'x-component': 'InputNumber' },
    },
    {
      type: 'integer',
      name: 'relevanceScore',
      interface: 'integer',
      uiSchema: { type: 'number', title: generateNTemplate('Relevance score'), 'x-component': 'InputNumber' },
    },
    {
      type: 'json',
      name: 'disciplines',
      interface: 'json',
      defaultValue: [],
      uiSchema: { type: 'array', title: generateNTemplate('Disciplines'), 'x-component': 'Input.JSON' },
    },
    {
      type: 'json',
      name: 'cpvCodes',
      interface: 'json',
      defaultValue: [],
      uiSchema: { type: 'array', title: generateNTemplate('CPV codes'), 'x-component': 'Input.JSON' },
    },
    {
      type: 'string',
      name: 'verdict',
      interface: 'select',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Fit'),
        'x-component': 'Select',
        enum: [
          { label: generateNTemplate('Strong'), value: 'strong', color: 'green' },
          { label: generateNTemplate('Possible'), value: 'possible', color: 'gold' },
          { label: generateNTemplate('Weak'), value: 'weak', color: 'default' },
        ],
      },
    },
    {
      type: 'string',
      name: 'status',
      interface: 'select',
      defaultValue: 'new',
      uiSchema: {
        type: 'string',
        title: generateNTemplate('Bid status'),
        'x-component': 'Select',
        enum: [
          { label: generateNTemplate('New'), value: 'new', color: 'blue' },
          { label: generateNTemplate('Reviewing'), value: 'reviewing', color: 'gold' },
          { label: generateNTemplate('Bidding'), value: 'bidding', color: 'purple' },
          { label: generateNTemplate('Submitted'), value: 'submitted', color: 'green' },
          { label: generateNTemplate('Declined'), value: 'declined', color: 'default' },
        ],
      },
    },
    /** The full structured brief, so the UI never has to re-derive it. */
    {
      type: 'json',
      name: 'bidBrief',
      interface: 'json',
      uiSchema: { type: 'object', title: generateNTemplate('Bid brief'), 'x-component': 'Input.JSON' },
    },
    /** Untouched source payload, kept so notices can be re-parsed after a rule change. */
    { type: 'json', name: 'raw', hidden: true },
  ],
} as CollectionOptions;
