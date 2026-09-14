/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import {
  buildAuthHeaders,
  type CrmTargetRow,
  joinUrl,
  readCreatedId,
  readFieldMap,
  readPath,
  resolveLeadUrl,
  resolveToken,
} from '../crm/target';

const target = (overrides: Partial<CrmTargetRow> = {}): CrmTargetRow => ({
  id: 1,
  baseUrl: 'https://crm.example.com',
  tokenVariable: 'CRM_TOKEN',
  ...overrides,
});

describe('joinUrl', () => {
  it('joins without doubling or dropping the slash', () => {
    expect(joinUrl('https://a.com', 'api/x')).toBe('https://a.com/api/x');
    expect(joinUrl('https://a.com/', '/api/x')).toBe('https://a.com/api/x');
    expect(joinUrl('https://a.com//', '//api/x')).toBe('https://a.com/api/x');
  });
});

describe('resolveLeadUrl', () => {
  it('defaults to the NocoBase CRM leads endpoint', () => {
    expect(resolveLeadUrl(target())).toBe('https://crm.example.com/api/nb_crm_leads:create');
  });

  it('honours a configured path, so another CRM needs no code change', () => {
    expect(resolveLeadUrl(target({ leadPath: '/crm/v3/objects/leads' }))).toBe(
      'https://crm.example.com/crm/v3/objects/leads',
    );
  });

  it('refuses to build a URL without a base', () => {
    expect(() => resolveLeadUrl(target({ baseUrl: '  ' }))).toThrow('no base URL');
  });
});

describe('resolveToken', () => {
  it('reads the value from the environment by the configured name', () => {
    expect(resolveToken(target(), { CRM_TOKEN: 'secret-value' })).toBe('secret-value');
  });

  it('trims surrounding whitespace', () => {
    expect(resolveToken(target(), { CRM_TOKEN: '  secret-value  ' })).toBe('secret-value');
  });

  it('fails clearly when the variable is unset or blank', () => {
    expect(() => resolveToken(target(), {})).toThrow('is not set');
    expect(() => resolveToken(target(), { CRM_TOKEN: '   ' })).toThrow('is not set');
  });

  it('fails when no variable name is configured, rather than sending an empty token', () => {
    expect(() => resolveToken(target({ tokenVariable: null }), { CRM_TOKEN: 'x' })).toThrow('no token variable');
  });

  it('never reveals the token value in its error message', () => {
    try {
      resolveToken(target(), { CRM_TOKEN: '' });
    } catch (error) {
      expect((error as Error).message).toContain('CRM_TOKEN');
    }
  });
});

describe('buildAuthHeaders', () => {
  it('defaults to a bearer Authorization header', () => {
    expect(buildAuthHeaders(target(), 'abc')).toEqual({ Authorization: 'Bearer abc' });
  });

  it('supports a custom header and scheme', () => {
    expect(buildAuthHeaders(target({ authHeader: 'X-API-Key', authScheme: '' }), 'abc')).toEqual({
      'X-API-Key': 'abc',
    });
  });

  it('sends the token raw when the scheme is blank', () => {
    expect(buildAuthHeaders(target({ authScheme: '   ' }), 'abc')).toEqual({ Authorization: 'abc' });
  });
});

describe('readPath', () => {
  it('walks a dot path and stops safely at a missing segment', () => {
    expect(readPath({ data: { id: 7 } }, 'data.id')).toBe(7);
    expect(readPath({ data: null }, 'data.id')).toBeUndefined();
    expect(readPath(undefined, 'data.id')).toBeUndefined();
  });
});

describe('readCreatedId', () => {
  it('reads the id from the default path', () => {
    expect(readCreatedId({ data: { id: 'LEAD-1' } })).toBe('LEAD-1');
  });

  it('stringifies a numeric id, because the tender stores it as text', () => {
    expect(readCreatedId({ data: { id: 42 } })).toBe('42');
  });

  it('honours a configured path', () => {
    expect(readCreatedId({ result: { leadId: 'L9' } }, 'result.leadId')).toBe('L9');
  });

  it('returns undefined for an empty body rather than inventing an id', () => {
    expect(readCreatedId({})).toBeUndefined();
    expect(readCreatedId({ data: { id: '' } })).toBeUndefined();
    expect(readCreatedId(null)).toBeUndefined();
  });
});

describe('readFieldMap', () => {
  it('keeps only string mappings', () => {
    expect(readFieldMap(target({ fieldMap: { title: 'subject', organisation: '' } }))).toEqual({ title: 'subject' });
  });

  it('returns undefined when nothing usable is configured, so the default map applies', () => {
    expect(readFieldMap(target({ fieldMap: {} }))).toBeUndefined();
    expect(readFieldMap(target({ fieldMap: null }))).toBeUndefined();
  });
});
