/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { createMockServer, MockServer } from '@nocobase/test';
import { COLLECTION, CRM_EVENT, MAX_EVENT_DEPTH, WORKSPACE_EVENT } from '../../constants';
import type { EventEnvelope } from '../../types';
import { InboxConsumer } from '../bus/consumer';
import { EventDispatcher } from '../bus/dispatcher';
import { registerCrmHandlers } from '../bus/handlers';
import { writeOutboxEvent } from '../bus/outbox';
import { OutboxPublisher } from '../bus/publisher';
import { FakeStream } from './fake-stream';

const PLUGINS = ['field-sort', 'users', 'auth', 'acl', 'data-source-manager', 'crm-integration'];

function envelope(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    uuid: 'evt-1',
    name: CRM_EVENT.dealWon,
    source: 'crm',
    origin: 'user',
    depth: 0,
    occurredAt: new Date().toISOString(),
    payload: {
      dealUuid: 'deal-1',
      organisationUuid: 'org-1',
      organisationName: 'Northwind Studio',
      serviceType: 'visual_identity',
      dealName: 'Northwind rebrand',
    },
    ...overrides,
  };
}

describe('event bus', () => {
  let app: MockServer;
  let dispatcher: EventDispatcher;

  beforeEach(async () => {
    app = await createMockServer({ plugins: PLUGINS });
    dispatcher = new EventDispatcher(app);
    registerCrmHandlers(dispatcher);
  });

  afterEach(async () => {
    await app.destroy();
  });

  describe('inbound', () => {
    it('provisions a portal, a deal mirror and an organisation from crm.deal.won', async () => {
      const result = await dispatcher.dispatch(envelope());
      expect(result.outcome).toBe('processed');

      const project = await app.db.getRepository(COLLECTION.projects).findOne({ filter: { dealUuid: 'deal-1' } });
      expect(project.get('serviceType')).toBe('visual_identity');
      expect(project.get('portalEnabled')).toBe(true);

      const deal = await app.db.getRepository(COLLECTION.deals).findOne({ filter: { uuid: 'deal-1' } });
      expect(deal.get('currentStage')).toBe('strategy');
      expect(deal.get('wonAt')).toBeTruthy();

      const organisation = await app.db.getRepository(COLLECTION.organisations).findOne({ filter: { uuid: 'org-1' } });
      expect(organisation.get('name')).toBe('Northwind Studio');
    });

    it('treats a redelivered event as a duplicate and does nothing twice', async () => {
      await dispatcher.dispatch(envelope());
      const second = await dispatcher.dispatch(envelope());

      expect(second.outcome).toBe('duplicate');
      expect(await app.db.getRepository(COLLECTION.projects).count()).toBe(1);
      expect(await app.db.getRepository(COLLECTION.inbox).count()).toBe(1);
    });

    it('resumes the same portal when the same deal is won again under a new event', async () => {
      await dispatcher.dispatch(envelope());
      const result = await dispatcher.dispatch(envelope({ uuid: 'evt-2' }));

      expect(result.outcome).toBe('processed');
      expect(await app.db.getRepository(COLLECTION.projects).count()).toBe(1);
    });

    it('drops an event that has travelled too far', async () => {
      const result = await dispatcher.dispatch(envelope({ depth: MAX_EVENT_DEPTH }));

      expect(result.outcome).toBe('skipped');
      expect(result.reason).toBe('max-depth');
      expect(await app.db.getRepository(COLLECTION.projects).count()).toBe(0);

      const row = await app.db.getRepository(COLLECTION.inbox).findOne({ filter: { eventUuid: 'evt-1' } });
      expect(row.get('status')).toBe('skipped');
    });

    it('records an event it has no handler for rather than guessing', async () => {
      const result = await dispatcher.dispatch(envelope({ name: 'crm.invoice.raised' }));

      expect(result.outcome).toBe('skipped');
      expect(result.reason).toBe('no-handler');
    });

    it('records a handler failure and recovers it on retry', async () => {
      const broken = envelope({ payload: { dealUuid: 'deal-9', organisationUuid: 'org-9' } });
      const failed = await dispatcher.dispatch(broken);
      expect(failed.outcome).toBe('failed');

      const row = await app.db.getRepository(COLLECTION.inbox).findOne({ filter: { eventUuid: 'evt-1' } });
      expect(row.get('status')).toBe('failed');
      expect(row.get('lastError')).toContain('serviceType');

      // The operator corrects the payload at source and replays.
      await app.db.getRepository(COLLECTION.inbox).update({
        filterByTk: row.get('id'),
        values: { payload: { ...envelope().payload, dealUuid: 'deal-9' } },
      });
      expect(await dispatcher.retryFailed()).toBe(1);
      expect(await app.db.getRepository(COLLECTION.projects).count()).toBe(1);
    });

    it('rejects an unparseable message without claiming anything', async () => {
      const result = await dispatcher.dispatchRaw('not json at all');

      expect(result.outcome).toBe('rejected');
      expect(await app.db.getRepository(COLLECTION.inbox).count()).toBe(0);
    });

    it('mirrors a hand-set stage change and flags it as manual', async () => {
      await dispatcher.dispatch(envelope());
      const result = await dispatcher.dispatch(
        envelope({
          uuid: 'evt-stage',
          name: CRM_EVENT.dealStageChanged,
          origin: 'user',
          payload: { dealUuid: 'deal-1', stage: 'design', manual: true },
        }),
      );

      expect(result.outcome).toBe('processed');
      const deal = await app.db.getRepository(COLLECTION.deals).findOne({ filter: { uuid: 'deal-1' } });
      expect(deal.get('currentStage')).toBe('design');
      expect(deal.get('stageSetManually')).toBe(true);
    });

    it('does not treat our own automated move coming back as a human decision', async () => {
      await dispatcher.dispatch(envelope());
      await dispatcher.dispatch(
        envelope({
          uuid: 'evt-stage',
          name: CRM_EVENT.dealStageChanged,
          origin: 'automation',
          payload: { dealUuid: 'deal-1', stage: 'concept', manual: true },
        }),
      );

      const deal = await app.db.getRepository(COLLECTION.deals).findOne({ filter: { uuid: 'deal-1' } });
      expect(deal.get('stageSetManually')).toBe(false);
      // Nothing goes back out: this is where the two listeners would otherwise ping-pong.
      expect(await app.db.getRepository(COLLECTION.outbox).count()).toBe(0);
    });

    it('ignores a stage change for a deal it has never seen', async () => {
      const result = await dispatcher.dispatch(
        envelope({
          uuid: 'evt-stage',
          name: CRM_EVENT.dealStageChanged,
          payload: { dealUuid: 'deal-unknown', stage: 'design' },
        }),
      );

      expect(result.outcome).toBe('processed');
      expect(await app.db.getRepository(COLLECTION.deals).count()).toBe(0);
    });
  });

  describe('outbound', () => {
    it('publishes pending rows to the stream and marks them published', async () => {
      const stream = new FakeStream();
      const publisher = new OutboxPublisher(app, stream, { stream: 'workspace.events' });

      await writeOutboxEvent(app, {
        name: WORKSPACE_EVENT.requestOpened,
        payload: { projectUuid: 'project-1', summary: 'Extra landing page' },
        origin: 'user',
      });

      expect(await publisher.drain()).toBe(1);

      const published = stream.published<EventEnvelope>('workspace.events');
      expect(published).toHaveLength(1);
      expect(published[0].name).toBe(WORKSPACE_EVENT.requestOpened);
      expect(published[0].source).toBe('workspace');
      expect(published[0].uuid).toBeTruthy();

      const row = await app.db.getRepository(COLLECTION.outbox).findOne({});
      expect(row.get('status')).toBe('published');
      expect(row.get('streamMessageId')).toBe('1-0');
    });

    it('keeps a row pending and backs off when the stream refuses it', async () => {
      const stream = new FakeStream();
      const publisher = new OutboxPublisher(app, stream, { stream: 'workspace.events' });
      stream.failNextPublish = new Error('redis is down');

      await writeOutboxEvent(app, { name: WORKSPACE_EVENT.requestOpened, payload: {}, origin: 'user' });
      expect(await publisher.drain()).toBe(0);

      const row = await app.db.getRepository(COLLECTION.outbox).findOne({});
      expect(row.get('status')).toBe('pending');
      expect(row.get('attempts')).toBe(1);
      expect(row.get('lastError')).toBe('redis is down');
      expect((row.get('availableAt') as Date).getTime()).toBeGreaterThan(Date.now());
    });

    it('gives up on a row that keeps failing', async () => {
      const stream = new FakeStream();
      const publisher = new OutboxPublisher(app, stream, { stream: 'workspace.events', maxAttempts: 1 });
      stream.failNextPublish = new Error('redis is down');

      await writeOutboxEvent(app, { name: WORKSPACE_EVENT.requestOpened, payload: {}, origin: 'user' });
      await publisher.drain();

      const row = await app.db.getRepository(COLLECTION.outbox).findOne({});
      expect(row.get('status')).toBe('failed');
    });

    it('does nothing at all when redis is not configured', async () => {
      const stream = new FakeStream();
      stream.available = false;
      const publisher = new OutboxPublisher(app, stream, { stream: 'workspace.events' });

      await writeOutboxEvent(app, { name: WORKSPACE_EVENT.requestOpened, payload: {}, origin: 'user' });
      expect(await publisher.drain()).toBe(0);

      const row = await app.db.getRepository(COLLECTION.outbox).findOne({});
      expect(row.get('status')).toBe('pending');
      expect(row.get('attempts')).toBe(0);
    });
  });

  describe('round trip', () => {
    it('carries an event from the CRM stream through to a provisioned portal', async () => {
      const stream = new FakeStream();
      const consumer = new InboxConsumer(app, stream, dispatcher, {
        stream: 'crm.events',
        group: 'workspace',
        consumerName: 'test',
      });

      await stream.publish('crm.events', JSON.stringify(envelope()));
      expect(await consumer.pollOnce()).toBe(1);

      expect(await app.db.getRepository(COLLECTION.projects).count()).toBe(1);
      expect(stream.ackedCount()).toBe(1);
    });

    it('acknowledges a message whose handler failed so it cannot block the queue', async () => {
      const stream = new FakeStream();
      const consumer = new InboxConsumer(app, stream, dispatcher, {
        stream: 'crm.events',
        group: 'workspace',
        consumerName: 'test',
      });

      await stream.publish('crm.events', JSON.stringify(envelope({ payload: { dealUuid: 'only-this' } })));
      await stream.publish('crm.events', JSON.stringify(envelope({ uuid: 'evt-2' })));
      expect(await consumer.pollOnce()).toBe(2);

      expect(stream.ackedCount()).toBe(2);
      expect(await app.db.getRepository(COLLECTION.projects).count()).toBe(1);
    });
  });
});
