/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import { readSendOutcome } from '../sendOutcome';

describe('readSendOutcome', () => {
  it('unwraps the response envelope', () => {
    expect(readSendOutcome({ data: { status: 'sent', crmLeadId: 'LEAD-1' } })).toEqual({
      status: 'sent',
      crmLeadId: 'LEAD-1',
      reason: undefined,
    });
  });

  it('accepts a bare body', () => {
    expect(readSendOutcome({ status: 'skipped' }).status).toBe('skipped');
  });

  it('carries the reason through', () => {
    expect(readSendOutcome({ data: { status: 'failed', reason: 'HTTP 502' } }).reason).toBe('HTTP 502');
  });

  it('reads an unrecognised body as failed, never as sent', () => {
    for (const payload of [null, undefined, 'nonsense', {}, { data: { status: 'maybe' } }]) {
      expect(readSendOutcome(payload).status).toBe('failed');
    }
  });

  it('explains why an unreadable response was treated as a failure', () => {
    expect(readSendOutcome({}).reason).toContain('could not be read');
  });

  it('drops an empty lead id rather than reporting a blank one', () => {
    expect(readSendOutcome({ data: { status: 'sent', crmLeadId: '' } }).crmLeadId).toBeUndefined();
  });
});
