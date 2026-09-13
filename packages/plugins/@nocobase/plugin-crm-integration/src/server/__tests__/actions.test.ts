/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { createMockServer, MockServer } from '@nocobase/test';
import { COLLECTION } from '../../constants';
import { requestGateApproval } from '../delivery/approvals';
import { completePhase } from '../delivery/phases';
import { provisionClientPortal } from '../delivery/provisioning';
import { INTERNAL_TOKEN_ENV, INTERNAL_TOKEN_HEADER } from '../middleware/internal-api-guard';

const PLUGINS = ['field-sort', 'users', 'auth', 'acl', 'data-source-manager', 'system-settings', 'crm-integration'];
const TOKEN = 'shared-internal-token';

describe('internal actions API', () => {
  let app: MockServer;
  let previousToken: string | undefined;

  beforeEach(async () => {
    previousToken = process.env[INTERNAL_TOKEN_ENV];
    process.env[INTERNAL_TOKEN_ENV] = TOKEN;
    app = await createMockServer({ plugins: PLUGINS, acl: true });
  });

  afterEach(async () => {
    if (previousToken === undefined) {
      delete process.env[INTERNAL_TOKEN_ENV];
    } else {
      process.env[INTERNAL_TOKEN_ENV] = previousToken;
    }
    await app.destroy();
  });

  const body = {
    dealUuid: 'deal-1',
    organisationUuid: 'org-1',
    serviceType: 'visual_identity',
    organisationName: 'Northwind Studio',
  };

  it('provisions a portal for a caller carrying the shared token', async () => {
    const response = await app
      .agent()
      .set(INTERNAL_TOKEN_HEADER, TOKEN)
      .resource('crmInternal')
      .provisionClientPortal({ values: body });

    expect(response.status).toBe(200);
    expect(response.body.data.created).toBe(true);
    expect(response.body.data.invite).toBeTruthy();
    expect(await app.db.getRepository(COLLECTION.projects).count()).toBe(1);
  });

  it('creates a project with no portal through createProject', async () => {
    const response = await app
      .agent()
      .set(INTERNAL_TOKEN_HEADER, TOKEN)
      .resource('crmInternal')
      .createProject({ values: body });

    expect(response.status).toBe(200);
    const project = await app.db.getRepository(COLLECTION.projects).findOne({});
    expect(project.get('portalEnabled')).toBe(false);
  });

  it('turns away a caller with no token', async () => {
    const response = await app.agent().resource('crmInternal').provisionClientPortal({ values: body });

    expect(response.status).toBe(403);
    expect(await app.db.getRepository(COLLECTION.projects).count()).toBe(0);
  });

  it('turns away a caller with the wrong token', async () => {
    const response = await app
      .agent()
      .set(INTERNAL_TOKEN_HEADER, 'not-the-token')
      .resource('crmInternal')
      .provisionClientPortal({ values: body });

    expect(response.status).toBe(403);
  });

  it('stays shut when no token is configured at all', async () => {
    delete process.env[INTERNAL_TOKEN_ENV];
    const response = await app
      .agent()
      .set(INTERNAL_TOKEN_HEADER, TOKEN)
      .resource('crmInternal')
      .provisionClientPortal({ values: body });

    expect(response.status).toBe(503);
  });

  it('rejects an unknown service type before touching the database', async () => {
    const response = await app
      .agent()
      .set(INTERNAL_TOKEN_HEADER, TOKEN)
      .resource('crmInternal')
      .provisionClientPortal({ values: { ...body, serviceType: 'interpretive_dance' } });

    expect(response.status).toBe(400);
    expect(await app.db.getRepository(COLLECTION.projects).count()).toBe(0);
  });

  it('requires a deal uuid', async () => {
    const response = await app
      .agent()
      .set(INTERNAL_TOKEN_HEADER, TOKEN)
      .resource('crmInternal')
      .provisionClientPortal({ values: { ...body, dealUuid: undefined } });

    expect(response.status).toBe(400);
  });
});

describe('delivery phase actions', () => {
  let app: MockServer;

  beforeEach(async () => {
    app = await createMockServer({ plugins: PLUGINS, acl: true });
  });

  afterEach(async () => {
    await app.destroy();
  });

  async function gateFor(projectId: number) {
    const phases = await app.db.getRepository(COLLECTION.projectPhases).find({
      filter: { projectId },
      sort: ['position'],
      appends: ['phase'],
    });
    for (const phase of phases) {
      const definition = phase.get('phase') as { isGate?: boolean };
      if (definition.isGate) {
        return phase;
      }
      await completePhase(app, phase.get('uuid') as string);
    }
    throw new Error('project has no gate');
  }

  it('records a signed-in client approval through the portal action', async () => {
    const project = await provisionClientPortal(app, {
      dealUuid: 'deal-1',
      organisationUuid: 'org-1',
      serviceType: 'visual_identity',
    });
    await app.db.getRepository(COLLECTION.deals).create({
      values: { uuid: 'deal-1', organisationUuid: 'org-1', currentStage: 'strategy' },
    });
    const gate = await gateFor(project.id);
    await requestGateApproval(app, gate.get('uuid') as string);

    const user = await app.db.getRepository('users').findOne({});
    const agent = await app.agent().login(user);
    const response = await agent.resource('deliveryPhases').submitApproval({
      values: {
        projectPhaseUuid: gate.get('uuid'),
        action: 'approve',
        approvedByName: 'Ada Okonkwo',
        idempotencyKey: 'approval-1',
        artifactSnapshot: [{ fileUuid: 'file-1', name: 'Route B', versionLabel: 'v3' }],
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.phaseClosed).toBe(true);

    const approval = await app.db.getRepository(COLLECTION.approvals).findOne({});
    expect(approval.get('approvedByName')).toBe('Ada Okonkwo');
    expect(approval.get('approvedByUserId')).toBe(user.get('id'));
  });

  it('blocks an approval submitted with an empty name', async () => {
    const project = await provisionClientPortal(app, {
      dealUuid: 'deal-1',
      organisationUuid: 'org-1',
      serviceType: 'visual_identity',
    });
    const gate = await gateFor(project.id);
    await requestGateApproval(app, gate.get('uuid') as string);

    const user = await app.db.getRepository('users').findOne({});
    const agent = await app.agent().login(user);
    const response = await agent.resource('deliveryPhases').submitApproval({
      values: {
        projectPhaseUuid: gate.get('uuid'),
        action: 'approve',
        approvedByName: '  ',
        idempotencyKey: 'approval-1',
      },
    });

    expect(response.status).toBe(400);
    expect(await app.db.getRepository(COLLECTION.approvals).count()).toBe(0);
  });

  it('refuses an approval from someone who is not signed in', async () => {
    const response = await app
      .agent()
      .resource('deliveryPhases')
      .submitApproval({
        values: { projectPhaseUuid: 'anything', action: 'approve', approvedByName: 'Nobody' },
      });

    expect(response.status).toBe(401);
  });
});
