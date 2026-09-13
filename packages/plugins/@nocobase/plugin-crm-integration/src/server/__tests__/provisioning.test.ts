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
import { createProject, provisionClientPortal, ProvisioningError, seedServiceTracks } from '../delivery/provisioning';

const PLUGINS = ['field-sort', 'users', 'auth', 'acl', 'data-source-manager', 'crm-integration'];

describe('provisioning', () => {
  let app: MockServer;

  beforeEach(async () => {
    app = await createMockServer({ plugins: PLUGINS });
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('seeds the four service tracks on install', async () => {
    const tracks = await app.db.getRepository(COLLECTION.serviceTracks).find({ sort: ['id'] });
    expect(tracks.map((track) => track.get('serviceType'))).toEqual([
      'brand_strategy',
      'visual_identity',
      'web_design',
      'user_experience',
    ]);
  });

  it('seeds gates exactly where the spec places them', async () => {
    const track = await app.db
      .getRepository(COLLECTION.serviceTracks)
      .findOne({ filter: { serviceType: 'web_design' } });
    const phases = await app.db.getRepository(COLLECTION.trackPhases).find({
      filter: { trackId: track.get('id') },
      sort: ['position'],
    });
    expect(phases.map((phase) => phase.get('name'))).toEqual([
      'Discovery',
      'Information Architecture',
      'Design',
      'Development',
      'Testing & QA',
      'Launch',
    ]);
    expect(phases.filter((phase) => phase.get('isGate')).map((phase) => phase.get('name'))).toEqual([
      'Information Architecture',
      'Design',
      'Testing & QA',
      'Launch',
    ]);
    expect(phases.map((phase) => phase.get('crmStage'))).toEqual([
      'strategy',
      'concept',
      'design',
      'production',
      'production',
      'production',
    ]);
  });

  it('re-seeding leaves existing tracks untouched', async () => {
    const seeded = await seedServiceTracks(app);
    expect(seeded).toBe(0);
    const count = await app.db.getRepository(COLLECTION.serviceTracks).count();
    expect(count).toBe(4);
  });

  it('builds a project, its phases and a milestone per gate', async () => {
    const result = await createProject(app, {
      dealUuid: 'deal-1',
      organisationUuid: 'org-1',
      serviceType: 'visual_identity',
      projectName: 'Northwind rebrand',
    });
    expect(result.created).toBe(true);

    const phases = await app.db.getRepository(COLLECTION.projectPhases).find({
      filter: { projectId: result.id },
      sort: ['position'],
    });
    expect(phases).toHaveLength(5);
    expect(phases[0].get('status')).toBe('in_progress');
    expect(phases[0].get('startedAt')).toBeTruthy();
    expect(phases.slice(1).every((phase) => phase.get('status') === 'upcoming')).toBe(true);

    const milestones = await app.db.getRepository(COLLECTION.milestones).find({
      filter: { projectId: result.id },
    });
    expect(milestones.map((milestone) => milestone.get('name')).sort()).toEqual([
      'Final identity',
      'Identity direction',
    ]);

    const link = await app.db.getRepository(COLLECTION.externalLinks).findOne({
      filter: { localType: 'project', remoteUuid: 'deal-1' },
    });
    expect(link.get('localId')).toBe(String(result.id));
  });

  it('resumes the same portal when a deal is re-won rather than spawning a second', async () => {
    const first = await provisionClientPortal(app, {
      dealUuid: 'deal-1',
      organisationUuid: 'org-1',
      serviceType: 'visual_identity',
    });
    const second = await provisionClientPortal(app, {
      dealUuid: 'deal-1',
      organisationUuid: 'org-1',
      serviceType: 'visual_identity',
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.uuid).toBe(first.uuid);
    expect(await app.db.getRepository(COLLECTION.projects).count()).toBe(1);
    expect(await app.db.getRepository(COLLECTION.projectPhases).count()).toBe(5);
  });

  it('issues a signed expiring invite and stores only its hash', async () => {
    const portal = await provisionClientPortal(app, {
      dealUuid: 'deal-1',
      organisationUuid: 'org-1',
      serviceType: 'brand_strategy',
    });
    expect(portal.invite).toBeTruthy();
    expect(portal.inviteExpiresAt.getTime()).toBeGreaterThan(Date.now());

    const decoded = await app.authManager.jwt.decode(portal.invite);
    expect(decoded.scope).toBe('client-portal');
    expect(decoded.projectUuid).toBe(portal.uuid);

    const project = await app.db.getRepository(COLLECTION.projects).findOne({ filterByTk: portal.id });
    expect(project.get('portalEnabled')).toBe(true);
    expect(project.get('portalPath')).toBe(`/portal/${portal.uuid}`);
    expect(project.get('inviteTokenHash')).toBeTruthy();
    expect(project.get('inviteTokenHash')).not.toBe(portal.invite);
  });

  it('keeps one project per service on a multi-service deal', async () => {
    const identity = await provisionClientPortal(app, {
      dealUuid: 'deal-1',
      organisationUuid: 'org-1',
      serviceType: 'visual_identity',
    });
    const web = await provisionClientPortal(app, {
      dealUuid: 'deal-1',
      organisationUuid: 'org-1',
      serviceType: 'web_design',
    });

    expect(web.uuid).not.toBe(identity.uuid);
    expect(await app.db.getRepository(COLLECTION.projects).count()).toBe(2);
  });

  it('refuses a service type with no configured track', async () => {
    await app.db.getRepository(COLLECTION.serviceTracks).destroy({ filter: { serviceType: 'web_design' } });
    await expect(
      createProject(app, { dealUuid: 'deal-2', organisationUuid: 'org-1', serviceType: 'web_design' }),
    ).rejects.toBeInstanceOf(ProvisioningError);
  });
});
