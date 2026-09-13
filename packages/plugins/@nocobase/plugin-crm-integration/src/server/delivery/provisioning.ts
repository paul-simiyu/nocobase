/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Application } from '@nocobase/server';
import type { Transactionable } from '@nocobase/database';
import { createHash } from 'crypto';
import { COLLECTION, DEFAULTS } from '../../constants';
import type { CreateProjectInput, ProvisionPortalInput, ServiceType } from '../../types';
import { createLink } from '../identity/external-links';
import { withTransaction } from '../utils';
import { SERVICE_TRACK_SEEDS } from './tracks';

export class ProvisioningError extends Error {}

export interface ProjectResult {
  id: number;
  uuid: string;
  name: string;
  created: boolean;
}

export interface PortalResult extends ProjectResult {
  portalPath: string;
  /** Returned once, at issue time. Only its hash is stored. */
  invite: string | null;
  inviteExpiresAt: Date | null;
}

/** Seed the four tracks. Safe to call repeatedly: an existing version is left untouched. */
export async function seedServiceTracks(app: Application, options?: Transactionable): Promise<number> {
  return withTransaction(app.db, options, async (transaction) => {
    const trackRepository = app.db.getRepository(COLLECTION.serviceTracks);
    const phaseRepository = app.db.getRepository(COLLECTION.trackPhases);
    let seeded = 0;

    for (const seed of SERVICE_TRACK_SEEDS) {
      const existing = await trackRepository.findOne({
        filter: { serviceType: seed.serviceType, version: seed.version },
        transaction,
      });
      if (existing) {
        continue;
      }
      const track = await trackRepository.create({
        values: {
          serviceType: seed.serviceType,
          name: seed.name,
          version: seed.version,
          isCurrent: true,
        },
        transaction,
      });
      await phaseRepository.create({
        values: seed.phases.map((phase, index) => ({
          trackId: track.get('id') as number,
          position: index,
          name: phase.name,
          clientDescription: phase.clientDescription,
          isGate: phase.isGate,
          gateName: phase.gateName ?? null,
          crmStage: phase.crmStage,
        })),
        transaction,
      });
      seeded += 1;
    }
    return seeded;
  });
}

async function resolveCurrentTrack(app: Application, serviceType: ServiceType, transaction: Transactionable) {
  const track = await app.db.getRepository(COLLECTION.serviceTracks).findOne({
    filter: { serviceType, isCurrent: true },
    sort: ['-version'],
    transaction: transaction.transaction,
  });
  if (!track) {
    throw new ProvisioningError(`no track configured for service type "${serviceType}"`);
  }
  return track;
}

/**
 * Create a delivery project from the current track for its service.
 *
 * Idempotent on (deal, service type): a deal reopened and re-won resumes the project it
 * already has. The check runs inside the transaction, and a unique index backs it up if two
 * deliveries race.
 */
export async function createProject(
  app: Application,
  input: CreateProjectInput,
  options?: Transactionable,
): Promise<ProjectResult> {
  return withTransaction(app.db, options, async (transaction) => {
    const projectRepository = app.db.getRepository(COLLECTION.projects);
    const existing = await projectRepository.findOne({
      filter: { dealUuid: input.dealUuid, serviceType: input.serviceType },
      transaction,
    });
    if (existing) {
      return {
        id: existing.get('id') as number,
        uuid: existing.get('uuid') as string,
        name: existing.get('name') as string,
        created: false,
      };
    }

    const track = await resolveCurrentTrack(app, input.serviceType, { transaction });
    const phases = await app.db.getRepository(COLLECTION.trackPhases).find({
      filter: { trackId: track.get('id') as number },
      sort: ['position'],
      transaction,
    });
    if (!phases.length) {
      throw new ProvisioningError(`track "${track.get('name')}" has no phases`);
    }

    const project = await projectRepository.create({
      values: {
        name: input.projectName || `${track.get('name')}`,
        organisationUuid: input.organisationUuid,
        dealUuid: input.dealUuid,
        serviceType: input.serviceType,
        trackId: track.get('id') as number,
        trackVersion: track.get('version') as number,
        status: 'active',
      },
      transaction,
    });
    const projectId = project.get('id') as number;

    const projectPhaseRepository = app.db.getRepository(COLLECTION.projectPhases);
    const milestoneRepository = app.db.getRepository(COLLECTION.milestones);

    for (const [index, phase] of phases.entries()) {
      const active = index === 0;
      const projectPhase = await projectPhaseRepository.create({
        values: {
          projectId,
          phaseId: phase.get('id') as number,
          position: phase.get('position') as number,
          status: active ? 'in_progress' : 'upcoming',
          startedAt: active ? new Date() : null,
          awaitingClient: false,
        },
        transaction,
      });

      // Gates are the client-facing checkpoints; internal tasks roll up into them.
      if (phase.get('isGate')) {
        await milestoneRepository.create({
          values: {
            projectId,
            projectPhaseId: projectPhase.get('id') as number,
            name: (phase.get('gateName') as string) || (phase.get('name') as string),
            state: active ? 'in_progress' : 'upcoming',
          },
          transaction,
        });
      }
    }

    await createLink(app, { localType: 'project', localId: projectId, remoteUuid: input.dealUuid }, { transaction });

    return {
      id: projectId,
      uuid: project.get('uuid') as string,
      name: project.get('name') as string,
      created: true,
    };
  });
}

/**
 * Provision the client portal for a won deal.
 *
 * The client is a guest inside the Simpaul tenant, not a tenant of their own: they get a
 * signed, expiring invite to this project, never a password and never an account that owns
 * anything. Re-running this resumes the existing portal.
 */
export async function provisionClientPortal(
  app: Application,
  input: ProvisionPortalInput,
  options?: Transactionable,
): Promise<PortalResult> {
  return withTransaction(app.db, options, async (transaction) => {
    const project = await createProject(
      app,
      {
        dealUuid: input.dealUuid,
        organisationUuid: input.organisationUuid,
        serviceType: input.serviceType,
        projectName: input.projectName || input.organisationName,
      },
      { transaction },
    );

    const projectRepository = app.db.getRepository(COLLECTION.projects);
    const record = await projectRepository.findOne({ filterByTk: project.id, transaction });
    const portalPath = `/portal/${project.uuid}`;
    const existingExpiry = record?.get('inviteExpiresAt') as Date | null;
    const needsInvite = !existingExpiry || existingExpiry.getTime() <= Date.now();

    let invite: string | null = null;
    let inviteExpiresAt: Date | null = existingExpiry ?? null;

    if (needsInvite) {
      invite = app.authManager.jwt.sign(
        {
          scope: 'client-portal',
          projectUuid: project.uuid,
          organisationUuid: input.organisationUuid,
        },
        { expiresIn: DEFAULTS.inviteExpiresIn },
      );
      inviteExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    }

    await projectRepository.update({
      filterByTk: project.id,
      values: {
        portalEnabled: true,
        portalPath,
        ...(invite
          ? {
              inviteTokenHash: createHash('sha256').update(invite).digest('hex'),
              inviteIssuedAt: new Date(),
              inviteExpiresAt,
            }
          : {}),
      },
      transaction,
    });

    return { ...project, portalPath, invite, inviteExpiresAt };
  });
}
