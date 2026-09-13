/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

export const NAMESPACE = '@nocobase/plugin-crm-integration';

/**
 * Collections owned by this plugin. The `crm` prefix marks the integration bus and the
 * local mirrors of CRM-owned records; the `delivery` prefix marks Workspace-owned delivery
 * records. Nothing here is ever written by the CRM directly — see the internal actions API.
 */
export const COLLECTION = {
  organisations: 'crmOrganisations',
  externalLinks: 'crmExternalLinks',
  outbox: 'crmOutbox',
  inbox: 'crmInbox',
  deals: 'crmDeals',
  serviceTracks: 'deliveryServiceTracks',
  trackPhases: 'deliveryTrackPhases',
  projects: 'deliveryProjects',
  projectPhases: 'deliveryProjectPhases',
  milestones: 'deliveryMilestones',
  approvals: 'deliveryApprovals',
} as const;

/** Events the CRM emits and the Workspace consumes. */
export const CRM_EVENT = {
  organisationUpserted: 'crm.organisation.upserted',
  dealWon: 'crm.deal.won',
  dealStageChanged: 'crm.deal.stage_changed',
} as const;

/** Events the Workspace emits and the CRM consumes. */
export const WORKSPACE_EVENT = {
  milestoneApproved: 'workspace.milestone.approved',
  projectStageReached: 'workspace.project.stage_reached',
  projectCompleted: 'workspace.project.completed',
  requestOpened: 'workspace.request.opened',
  taskCompleted: 'workspace.task.completed',
  proofApproved: 'workspace.proof.approved',
} as const;

export const SYSTEM = {
  workspace: 'workspace',
  crm: 'crm',
} as const;

/**
 * The four CRM stages, in order. This is a delivery pipeline, not a sales one: the deal is
 * already won by the time a project exists, which is what makes auto-advancing safe.
 */
export const CRM_STAGES = ['strategy', 'concept', 'design', 'production'] as const;

export const SERVICE_TYPES = ['brand_strategy', 'visual_identity', 'web_design', 'user_experience'] as const;

export const PHASE_STATUS = ['upcoming', 'in_progress', 'complete'] as const;

export const MILESTONE_STATE = ['upcoming', 'in_progress', 'awaiting_approval', 'complete'] as const;

export const APPROVAL_ACTIONS = ['approve', 'approve_with_conditions', 'request_changes'] as const;

export const EVENT_ORIGINS = ['user', 'automation', 'system'] as const;

export const OUTBOX_STATUS = ['pending', 'published', 'failed'] as const;

export const INBOX_STATUS = ['processing', 'processed', 'failed', 'skipped'] as const;

/**
 * Maximum number of hops an event may travel before the bus refuses it. An automation that
 * fires an action that fires the same automation would otherwise loop forever.
 */
export const MAX_EVENT_DEPTH = 8;

export const DEFAULTS = {
  crmStream: 'crm.events',
  workspaceStream: 'workspace.events',
  consumerGroup: 'workspace',
  publishIntervalMs: 2000,
  publishBatchSize: 50,
  consumerBlockMs: 5000,
  consumerBatchSize: 20,
  maxPublishAttempts: 10,
  inviteExpiresIn: '14d',
  portalVersion: '1',
} as const;
