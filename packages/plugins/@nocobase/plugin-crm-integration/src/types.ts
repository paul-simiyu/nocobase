/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
import type {
  APPROVAL_ACTIONS,
  CRM_STAGES,
  EVENT_ORIGINS,
  MILESTONE_STATE,
  PHASE_STATUS,
  SERVICE_TYPES,
} from './constants';

export type CrmStage = (typeof CRM_STAGES)[number];
export type ServiceType = (typeof SERVICE_TYPES)[number];
export type PhaseStatus = (typeof PHASE_STATUS)[number];
export type MilestoneState = (typeof MILESTONE_STATE)[number];
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];
export type EventOrigin = (typeof EVENT_ORIGINS)[number];

/**
 * Every message on the bus carries this envelope. `origin` and `depth` are the loop guard:
 * a stage change the CRM made because of us comes back as `automation` and is not re-emitted.
 */
export interface EventEnvelope<TPayload = unknown> {
  uuid: string;
  name: string;
  source: string;
  origin: EventOrigin;
  depth: number;
  occurredAt: string;
  payload: TPayload;
}

export interface CrmOrganisationUpsertedPayload {
  organisationUuid: string;
  name: string;
  primaryContactEmail?: string;
  primaryContactName?: string;
}

export interface CrmDealWonPayload {
  dealUuid: string;
  organisationUuid: string;
  organisationName?: string;
  serviceType: ServiceType;
  dealName?: string;
  clientContactEmail?: string;
  clientContactName?: string;
  stage?: CrmStage;
}

export interface CrmDealStageChangedPayload {
  dealUuid: string;
  stage: CrmStage;
  previousStage?: CrmStage;
  /** True when a person moved the deal by hand in the CRM. Automation then stands down. */
  manual?: boolean;
  changedByName?: string;
}

export interface WorkspaceMilestoneApprovedPayload {
  projectUuid: string;
  dealUuid: string;
  organisationUuid: string;
  milestoneName: string;
  phaseName: string;
  approvalUuid: string;
  action: ApprovalAction;
  approvedByName: string;
  approvedAt: string;
  conditionsText?: string;
  artifactSnapshot: ArtifactSnapshotEntry[];
}

export interface WorkspaceProjectStageReachedPayload {
  projectUuid: string;
  dealUuid: string;
  organisationUuid: string;
  stage: CrmStage;
  previousStage: CrmStage | null;
  phaseName: string;
  reason: string;
}

export interface WorkspaceProjectCompletedPayload {
  projectUuid: string;
  dealUuid: string;
  organisationUuid: string;
  finalPhaseName: string;
  completedAt: string;
}

/**
 * Approving "the logo files" means nothing six months later; approving these specific
 * versions is defensible. Captured at the moment of approval, never recomputed.
 */
export interface ArtifactSnapshotEntry {
  fileUuid: string;
  name: string;
  versionLabel: string;
  versionHash?: string;
}

export interface ProvisionPortalInput {
  dealUuid: string;
  organisationUuid: string;
  serviceType: ServiceType;
  organisationName?: string;
  projectName?: string;
  clientContactEmail?: string;
  clientContactName?: string;
}

export interface CreateProjectInput {
  dealUuid: string;
  organisationUuid: string;
  serviceType: ServiceType;
  projectName?: string;
}

export interface RecordApprovalInput {
  projectPhaseUuid: string;
  action: ApprovalAction;
  approvedByName: string;
  artifactSnapshot: ArtifactSnapshotEntry[];
  idempotencyKey: string;
  approvedByUserId?: number;
  conditionsText?: string;
  ipAddress?: string;
  portalVersion?: string;
  supersedesUuid?: string;
}

export interface TrackPhaseSeed {
  name: string;
  clientDescription: string;
  isGate: boolean;
  crmStage: CrmStage;
  /** Client-facing name of the gate's milestone, e.g. "Logo direction — Route B". */
  gateName?: string;
}

export interface ServiceTrackSeed {
  serviceType: ServiceType;
  name: string;
  version: number;
  phases: TrackPhaseSeed[];
}
