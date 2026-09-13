/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { ServiceTrackSeed } from '../../types';

/**
 * The four client-facing phase tracks. Discovery opens every track, so the portal's first
 * screen is identical regardless of service.
 *
 * Gate placement follows the spec's explicit gate lists. Note that Brand Strategy's last
 * gate is Positioning rather than a final delivery gate — see docs/contract/events.md.
 *
 * Bump `version` rather than editing a track in place: in-flight projects pin the version
 * they started on.
 */
export const SERVICE_TRACK_SEEDS: ServiceTrackSeed[] = [
  {
    serviceType: 'brand_strategy',
    name: 'Brand Strategy',
    version: 1,
    phases: [
      {
        name: 'Discovery',
        clientDescription: 'We learn your business, your market and what this work has to achieve.',
        isGate: true,
        gateName: 'Project brief',
        crmStage: 'strategy',
      },
      {
        name: 'Research & Audit',
        clientDescription: 'We audit your current brand and research your category and competitors.',
        isGate: false,
        crmStage: 'strategy',
      },
      {
        name: 'Positioning',
        clientDescription: 'We set out where your brand should stand and how it should be understood.',
        isGate: true,
        gateName: 'Positioning direction',
        crmStage: 'concept',
      },
      {
        name: 'Strategy Presentation',
        clientDescription: 'We present the strategy in full and talk it through with your team.',
        isGate: false,
        crmStage: 'design',
      },
      {
        name: 'Handover',
        clientDescription: 'You receive the final strategy documents and everything that supports them.',
        isGate: false,
        crmStage: 'production',
      },
    ],
  },
  {
    serviceType: 'visual_identity',
    name: 'Visual Identity',
    version: 1,
    phases: [
      {
        name: 'Discovery',
        clientDescription: 'We learn your business, your market and what this work has to achieve.',
        isGate: false,
        crmStage: 'strategy',
      },
      {
        name: 'Concept Development',
        clientDescription: 'We develop distinct visual routes, each with its own rationale.',
        isGate: false,
        crmStage: 'concept',
      },
      {
        name: 'Direction Selection',
        clientDescription: 'You choose the route we take forward. This is the decision the rest of the work rests on.',
        isGate: true,
        gateName: 'Identity direction',
        crmStage: 'concept',
      },
      {
        name: 'Refinement',
        clientDescription: 'We refine the chosen route until it is ready to become a full asset set.',
        isGate: true,
        gateName: 'Final identity',
        crmStage: 'design',
      },
      {
        name: 'Asset Delivery',
        clientDescription: 'You receive the full asset set in every format you need, with usage guidance.',
        isGate: false,
        crmStage: 'production',
      },
    ],
  },
  {
    serviceType: 'web_design',
    name: 'Web Design & Development',
    version: 1,
    phases: [
      {
        name: 'Discovery',
        clientDescription: 'We learn your business, your market and what this work has to achieve.',
        isGate: false,
        crmStage: 'strategy',
      },
      {
        name: 'Information Architecture',
        clientDescription: 'We map every page and how people move between them.',
        isGate: true,
        gateName: 'Sitemap',
        crmStage: 'concept',
      },
      {
        name: 'Design',
        clientDescription: 'We design the pages, from key templates through to the detail.',
        isGate: true,
        gateName: 'Page designs',
        crmStage: 'design',
      },
      {
        name: 'Development',
        clientDescription: 'We build the site and connect everything it needs to run.',
        isGate: false,
        crmStage: 'production',
      },
      {
        name: 'Testing & QA',
        clientDescription: 'We test across devices and browsers, and you run through it yourself.',
        isGate: true,
        gateName: 'User acceptance testing',
        crmStage: 'production',
      },
      {
        name: 'Launch',
        clientDescription: 'We take the site live once you give the word.',
        isGate: true,
        gateName: 'Go-live authorisation',
        crmStage: 'production',
      },
    ],
  },
  {
    serviceType: 'user_experience',
    name: 'User Experience Design',
    version: 1,
    phases: [
      {
        name: 'Discovery',
        clientDescription: 'We learn your business, your market and what this work has to achieve.',
        isGate: false,
        crmStage: 'strategy',
      },
      {
        name: 'Research',
        clientDescription: 'We study how your users behave now and where the work gets stuck.',
        isGate: true,
        gateName: 'Research findings',
        crmStage: 'strategy',
      },
      {
        name: 'Structure & Flows',
        clientDescription: 'We set out the structure and the routes people take through it.',
        isGate: false,
        crmStage: 'concept',
      },
      {
        name: 'Prototype',
        clientDescription: 'We build a working prototype and walk you through it.',
        isGate: true,
        gateName: 'Prototype walkthrough',
        crmStage: 'design',
      },
      {
        name: 'Usability Testing',
        clientDescription: 'We put the prototype in front of real users and report what we learn.',
        isGate: false,
        crmStage: 'design',
      },
      {
        name: 'Handover',
        clientDescription: 'You receive the final designs, flows and research in full.',
        isGate: false,
        crmStage: 'production',
      },
    ],
  },
];
