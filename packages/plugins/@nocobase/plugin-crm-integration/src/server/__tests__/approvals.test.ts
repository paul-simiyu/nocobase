/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { createMockServer, MockServer } from '@nocobase/test';
import { COLLECTION, WORKSPACE_EVENT } from '../../constants';
import type { ServiceType } from '../../types';
import { computeDealStage } from '../delivery/advancement';
import { recordApproval, requestGateApproval } from '../delivery/approvals';
import { DeliveryError } from '../delivery/errors';
import { completePhase } from '../delivery/phases';
import { provisionClientPortal } from '../delivery/provisioning';

const PLUGINS = ['field-sort', 'users', 'auth', 'acl', 'data-source-manager', 'crm-integration'];

const SNAPSHOT = [{ fileUuid: 'file-1', name: 'Route B lockup', versionLabel: 'v3', versionHash: 'abc123' }];

describe('gate approvals and the stage ratchet', () => {
  let app: MockServer;

  beforeEach(async () => {
    app = await createMockServer({ plugins: PLUGINS });
  });

  afterEach(async () => {
    await app.destroy();
  });

  async function setUpProject(serviceType: ServiceType = 'visual_identity', dealUuid = 'deal-1') {
    const portal = await provisionClientPortal(app, {
      dealUuid,
      organisationUuid: 'org-1',
      serviceType,
    });
    await app.db.getRepository(COLLECTION.deals).create({
      values: { uuid: dealUuid, organisationUuid: 'org-1', currentStage: 'strategy' },
    });
    return portal;
  }

  async function phases(projectId: number) {
    return app.db.getRepository(COLLECTION.projectPhases).find({
      filter: { projectId },
      sort: ['position'],
      appends: ['phase'],
    });
  }

  async function outboxNames(): Promise<string[]> {
    const rows = await app.db.getRepository(COLLECTION.outbox).find({ sort: ['id'] });
    return rows.map((row) => row.get('eventName') as string);
  }

  /** Walk a project forward to its next open gate by finishing the ordinary phases before it. */
  async function advanceToFirstGate(projectId: number) {
    for (const phase of await phases(projectId)) {
      if (phase.get('status') === 'complete') {
        continue;
      }
      const definition = phase.get('phase') as { isGate?: boolean };
      if (definition.isGate) {
        return phase;
      }
      await completePhase(app, phase.get('uuid') as string);
    }
    throw new Error('project has no open gate');
  }

  describe('requesting an approval', () => {
    it('turns on the awaiting-you slot and puts the milestone up for approval', async () => {
      const project = await setUpProject();
      const gate = await advanceToFirstGate(project.id);

      const result = await requestGateApproval(app, gate.get('uuid') as string);
      expect(result.milestoneName).toBe('Identity direction');

      const reloaded = await app.db
        .getRepository(COLLECTION.projectPhases)
        .findOne({ filterByTk: gate.get('id') as number });
      expect(reloaded.get('awaitingClient')).toBe(true);

      const milestone = await app.db
        .getRepository(COLLECTION.milestones)
        .findOne({ filter: { projectPhaseId: gate.get('id') as number } });
      expect(milestone.get('state')).toBe('awaiting_approval');
    });

    it('refuses a phase that is not a gate', async () => {
      const project = await setUpProject();
      const first = (await phases(project.id))[0];
      await expect(requestGateApproval(app, first.get('uuid') as string)).rejects.toBeInstanceOf(DeliveryError);
    });
  });

  describe('approving', () => {
    it('closes the gate, activates the next phase and files a receipt', async () => {
      const project = await setUpProject();
      const gate = await advanceToFirstGate(project.id);
      await requestGateApproval(app, gate.get('uuid') as string);

      const result = await recordApproval(app, {
        projectPhaseUuid: gate.get('uuid') as string,
        action: 'approve',
        approvedByName: 'Ada Okonkwo',
        artifactSnapshot: SNAPSHOT,
        idempotencyKey: 'approval-1',
        ipAddress: '198.51.100.7',
      });

      expect(result.phaseClosed).toBe(true);
      expect(result.nextPhaseName).toBe('Refinement');
      expect(result.projectCompleted).toBe(false);

      const all = await phases(project.id);
      expect(all[2].get('status')).toBe('complete');
      expect(all[2].get('awaitingClient')).toBe(false);
      expect(all[3].get('status')).toBe('in_progress');

      const approval = await app.db.getRepository(COLLECTION.approvals).findOne({ filter: { uuid: result.uuid } });
      expect(approval.get('approvedByName')).toBe('Ada Okonkwo');
      expect(approval.get('ipAddress')).toBe('198.51.100.7');
      expect(approval.get('portalVersion')).toBe('1');
      expect(approval.get('artifactSnapshot')).toEqual(SNAPSHOT);
    });

    it('moves the deal forward and tells the CRM why', async () => {
      const project = await setUpProject();
      const gate = await advanceToFirstGate(project.id);
      await requestGateApproval(app, gate.get('uuid') as string);

      const result = await recordApproval(app, {
        projectPhaseUuid: gate.get('uuid') as string,
        action: 'approve',
        approvedByName: 'Ada Okonkwo',
        artifactSnapshot: SNAPSHOT,
        idempotencyKey: 'approval-1',
      });

      expect(result.stage.outcome).toBe('emitted');
      expect(result.stage.previousStage).toBe('concept');
      expect(result.stage.stage).toBe('design');

      const deal = await app.db.getRepository(COLLECTION.deals).findOne({ filter: { uuid: 'deal-1' } });
      expect(deal.get('currentStage')).toBe('design');

      // Ordinary phases moved the deal earlier too; this asserts on the approval's own event.
      const stageEvents = await app.db
        .getRepository(COLLECTION.outbox)
        .find({ filter: { eventName: WORKSPACE_EVENT.projectStageReached }, sort: ['-id'] });
      const payload = stageEvents[0].get('payload') as Record<string, unknown>;
      expect(payload.reason).toBe('Identity direction approved by Ada Okonkwo');
      expect(payload.previousStage).toBe('concept');
      expect(stageEvents[0].get('origin')).toBe('automation');
    });

    it('does not double-fire on a double-click', async () => {
      const project = await setUpProject();
      const gate = await advanceToFirstGate(project.id);
      await requestGateApproval(app, gate.get('uuid') as string);

      const input = {
        projectPhaseUuid: gate.get('uuid') as string,
        action: 'approve' as const,
        approvedByName: 'Ada Okonkwo',
        artifactSnapshot: SNAPSHOT,
        idempotencyKey: 'approval-1',
      };
      const first = await recordApproval(app, input);
      const second = await recordApproval(app, input);

      expect(second.duplicate).toBe(true);
      expect(second.uuid).toBe(first.uuid);
      expect(await app.db.getRepository(COLLECTION.approvals).count()).toBe(1);
      expect((await outboxNames()).filter((name) => name === WORKSPACE_EVENT.milestoneApproved)).toHaveLength(1);
    });

    it('captures conditions without holding the gate open', async () => {
      const project = await setUpProject();
      const gate = await advanceToFirstGate(project.id);
      await requestGateApproval(app, gate.get('uuid') as string);

      const result = await recordApproval(app, {
        projectPhaseUuid: gate.get('uuid') as string,
        action: 'approve_with_conditions',
        approvedByName: 'Ada Okonkwo',
        conditionsText: 'Warm the secondary palette slightly',
        artifactSnapshot: SNAPSHOT,
        idempotencyKey: 'approval-1',
      });

      expect(result.phaseClosed).toBe(true);
      const event = await app.db
        .getRepository(COLLECTION.outbox)
        .findOne({ filter: { eventName: WORKSPACE_EVENT.milestoneApproved } });
      const payload = event.get('payload') as Record<string, unknown>;
      expect(payload.action).toBe('approve_with_conditions');
      expect(payload.conditionsText).toBe('Warm the secondary palette slightly');
    });

    it('completes the project when the final phase is itself a gate', async () => {
      const project = await setUpProject('web_design');
      let gate = await advanceToFirstGate(project.id);
      let round = 0;

      // Walk the whole Web track: four gates with ordinary phases between them.
      while (round < 10) {
        round += 1;
        await requestGateApproval(app, gate.get('uuid') as string);
        const result = await recordApproval(app, {
          projectPhaseUuid: gate.get('uuid') as string,
          action: 'approve',
          approvedByName: 'Ada Okonkwo',
          artifactSnapshot: SNAPSHOT,
          idempotencyKey: `approval-${round}`,
        });
        if (result.projectCompleted) {
          break;
        }
        gate = await advanceToFirstGate(project.id);
      }

      const record = await app.db.getRepository(COLLECTION.projects).findOne({ filterByTk: project.id });
      expect(record.get('status')).toBe('complete');
      expect(record.get('completedAt')).toBeTruthy();
      expect(await outboxNames()).toContain(WORKSPACE_EVENT.projectCompleted);
    });
  });

  describe('requesting changes', () => {
    it('holds the gate open, hands the ball back and moves the revision counter', async () => {
      const project = await setUpProject();
      const gate = await advanceToFirstGate(project.id);
      await requestGateApproval(app, gate.get('uuid') as string);

      const result = await recordApproval(app, {
        projectPhaseUuid: gate.get('uuid') as string,
        action: 'request_changes',
        approvedByName: 'Ada Okonkwo',
        artifactSnapshot: SNAPSHOT,
        idempotencyKey: 'approval-1',
      });

      expect(result.phaseClosed).toBe(false);
      expect(result.revisionRound).toBe(2);
      expect(result.stage).toBeNull();

      const reloaded = await app.db
        .getRepository(COLLECTION.projectPhases)
        .findOne({ filterByTk: gate.get('id') as number });
      expect(reloaded.get('status')).toBe('in_progress');
      expect(reloaded.get('awaitingClient')).toBe(false);
      expect(reloaded.get('revisionRound')).toBe(2);

      const milestone = await app.db
        .getRepository(COLLECTION.milestones)
        .findOne({ filter: { projectPhaseId: gate.get('id') as number } });
      expect(milestone.get('state')).toBe('in_progress');
      expect(await outboxNames()).not.toContain(WORKSPACE_EVENT.milestoneApproved);
    });
  });

  describe('validation', () => {
    it('blocks an approval with no name typed', async () => {
      const project = await setUpProject();
      const gate = await advanceToFirstGate(project.id);
      await expect(
        recordApproval(app, {
          projectPhaseUuid: gate.get('uuid') as string,
          action: 'approve',
          approvedByName: '   ',
          artifactSnapshot: SNAPSHOT,
          idempotencyKey: 'approval-1',
        }),
      ).rejects.toMatchObject({ code: 'name-required' });
    });

    it('refuses to approve a phase that is not a gate', async () => {
      const project = await setUpProject();
      const first = (await phases(project.id))[0];
      await expect(
        recordApproval(app, {
          projectPhaseUuid: first.get('uuid') as string,
          action: 'approve',
          approvedByName: 'Ada Okonkwo',
          artifactSnapshot: SNAPSHOT,
          idempotencyKey: 'approval-1',
        }),
      ).rejects.toMatchObject({ code: 'not-a-gate' });
    });

    it('refuses to reopen a closed gate', async () => {
      const project = await setUpProject();
      const gate = await advanceToFirstGate(project.id);
      await requestGateApproval(app, gate.get('uuid') as string);
      await recordApproval(app, {
        projectPhaseUuid: gate.get('uuid') as string,
        action: 'approve',
        approvedByName: 'Ada Okonkwo',
        artifactSnapshot: SNAPSHOT,
        idempotencyKey: 'approval-1',
      });

      await expect(
        recordApproval(app, {
          projectPhaseUuid: gate.get('uuid') as string,
          action: 'approve',
          approvedByName: 'Ada Okonkwo',
          artifactSnapshot: SNAPSHOT,
          idempotencyKey: 'approval-2',
        }),
      ).rejects.toMatchObject({ code: 'already-closed' });
    });

    it('refuses to complete a gate as if it were ordinary work', async () => {
      const project = await setUpProject();
      const gate = await advanceToFirstGate(project.id);
      await expect(completePhase(app, gate.get('uuid') as string)).rejects.toMatchObject({
        code: 'gate-needs-approval',
      });
    });

    it('records a superseding approval against the original', async () => {
      const project = await setUpProject();
      const gate = await advanceToFirstGate(project.id);
      await requestGateApproval(app, gate.get('uuid') as string);
      const first = await recordApproval(app, {
        projectPhaseUuid: gate.get('uuid') as string,
        action: 'request_changes',
        approvedByName: 'Ada Okonkwo',
        artifactSnapshot: SNAPSHOT,
        idempotencyKey: 'approval-1',
      });
      const second = await recordApproval(app, {
        projectPhaseUuid: gate.get('uuid') as string,
        action: 'approve',
        approvedByName: 'Ada Okonkwo',
        artifactSnapshot: SNAPSHOT,
        idempotencyKey: 'approval-2',
        supersedesUuid: first.uuid,
      });

      const record = await app.db.getRepository(COLLECTION.approvals).findOne({ filter: { uuid: second.uuid } });
      const original = await app.db.getRepository(COLLECTION.approvals).findOne({ filter: { uuid: first.uuid } });
      expect(record.get('supersedesId')).toBe(original.get('id'));
      // The original is still there, untouched.
      expect(original.get('action')).toBe('request_changes');
    });
  });

  describe('guardrails', () => {
    it('never moves the deal backwards', async () => {
      const project = await setUpProject();
      await app.db.getRepository(COLLECTION.deals).update({
        filter: { uuid: 'deal-1' },
        values: { currentStage: 'production' },
      });

      const gate = await advanceToFirstGate(project.id);
      await requestGateApproval(app, gate.get('uuid') as string);
      const result = await recordApproval(app, {
        projectPhaseUuid: gate.get('uuid') as string,
        action: 'approve',
        approvedByName: 'Ada Okonkwo',
        artifactSnapshot: SNAPSHOT,
        idempotencyKey: 'approval-1',
      });

      expect(result.stage.outcome).toBe('not-forward');
      const deal = await app.db.getRepository(COLLECTION.deals).findOne({ filter: { uuid: 'deal-1' } });
      expect(deal.get('currentStage')).toBe('production');
      expect(await outboxNames()).not.toContain(WORKSPACE_EVENT.projectStageReached);
    });

    it('lets the least-advanced track set the deal stage', async () => {
      const identity = await setUpProject('visual_identity');
      const web = await provisionClientPortal(app, {
        dealUuid: 'deal-1',
        organisationUuid: 'org-1',
        serviceType: 'web_design',
      });

      // Identity runs ahead to Design; Web has not left Discovery.
      const gate = await advanceToFirstGate(identity.id);
      await requestGateApproval(app, gate.get('uuid') as string);
      const result = await recordApproval(app, {
        projectPhaseUuid: gate.get('uuid') as string,
        action: 'approve',
        approvedByName: 'Ada Okonkwo',
        artifactSnapshot: SNAPSHOT,
        idempotencyKey: 'approval-1',
      });

      expect(await computeDealStage(app, 'deal-1')).toBe('strategy');
      expect(result.stage.outcome).toBe('not-forward');

      const deal = await app.db.getRepository(COLLECTION.deals).findOne({ filter: { uuid: 'deal-1' } });
      expect(deal.get('currentStage')).toBe('strategy');
      expect(web.uuid).not.toBe(identity.uuid);
    });

    it('stands down and logs a conflict when a person set the stage by hand', async () => {
      const project = await setUpProject();
      await app.db.getRepository(COLLECTION.deals).update({
        filter: { uuid: 'deal-1' },
        values: { stageSetManually: true },
      });

      const gate = await advanceToFirstGate(project.id);
      await requestGateApproval(app, gate.get('uuid') as string);
      const result = await recordApproval(app, {
        projectPhaseUuid: gate.get('uuid') as string,
        action: 'approve',
        approvedByName: 'Ada Okonkwo',
        artifactSnapshot: SNAPSHOT,
        idempotencyKey: 'approval-1',
      });

      expect(result.stage.outcome).toBe('manual-override');
      const deal = await app.db.getRepository(COLLECTION.deals).findOne({ filter: { uuid: 'deal-1' } });
      expect(deal.get('currentStage')).toBe('strategy');
      expect(deal.get('conflictNote')).toContain('set by hand');
      expect(deal.get('conflictAt')).toBeTruthy();
      expect(await outboxNames()).not.toContain(WORKSPACE_EVENT.projectStageReached);
      // The gate still closed — only the deal stage was left alone.
      expect(result.phaseClosed).toBe(true);
    });

    it('advances on ordinary work too, not only on gates', async () => {
      const project = await setUpProject('web_design');
      const all = await phases(project.id);

      // Discovery is not a gate, but finishing it takes the deal out of Strategy.
      await completePhase(app, all[0].get('uuid') as string);

      const deal = await app.db.getRepository(COLLECTION.deals).findOne({ filter: { uuid: 'deal-1' } });
      expect(deal.get('currentStage')).toBe('concept');
      expect(await outboxNames()).toContain(WORKSPACE_EVENT.projectStageReached);
    });
  });
});
