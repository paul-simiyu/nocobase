/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Alert, Collapse, Descriptions, Empty, Space, Tag, Typography } from 'antd';
import React from 'react';
import { formatAmount, formatDate, formatEvaluation, formatRemaining } from '../shared/summary';
import type { BidBrief } from '../shared/types';
import {
  disciplineLabelKey,
  urgencyColor,
  urgencyLabelKey,
  verdictColor,
  verdictLabelKey,
  yesNo,
} from './briefPresentation';

const { Paragraph, Text, Title } = Typography;

export interface BidBriefPanelProps {
  brief: BidBrief;
  /** Namespaced translator supplied by the field model. */
  t: (key: string) => string;
}

const bulletList = (items: string[]) => (
  <ul style={{ margin: 0, paddingInlineStart: 20 }}>
    {items.map((item) => (
      <li key={item}>{item}</li>
    ))}
  </ul>
);

/**
 * Renders a stored bid brief.
 *
 * Ordered the way a bid decision is actually made: can we still bid, what does it
 * cost to bid, is it our kind of work, what would disqualify us, what is left to
 * do - and last, what the notice never said.
 */
export const BidBriefPanel: React.FC<BidBriefPanelProps> = ({ brief, t }) => {
  const { commercials, fit, headline, requirements, submission, timeline } = brief;

  return (
    <Space direction="vertical" size="middle" style={{ display: 'flex' }}>
      <Space wrap>
        <Tag color={verdictColor(fit.verdict)}>{`${t(verdictLabelKey[fit.verdict])} · ${fit.score}/100`}</Tag>
        <Tag color={urgencyColor(timeline.urgency)}>
          {`${t(urgencyLabelKey[timeline.urgency])} · ${formatRemaining(timeline.daysRemaining)}`}
        </Tag>
        {fit.disciplines.map((discipline) => (
          <Tag key={discipline}>{t(disciplineLabelKey[discipline])}</Tag>
        ))}
      </Space>

      <Descriptions
        size="small"
        bordered
        column={{ xs: 1, sm: 1, md: 2 }}
        items={[
          { key: 'buyer', label: t('Buyer'), children: headline.buyer ?? t('not stated') },
          { key: 'country', label: t('Country'), children: headline.country ?? t('not stated') },
          { key: 'source', label: t('Source'), children: headline.source },
          {
            key: 'url',
            label: t('Notice URL'),
            children: (
              <a href={headline.url} target="_blank" rel="noopener noreferrer">
                {t('Open notice')}
              </a>
            ),
          },
          { key: 'published', label: t('Published at'), children: formatDate(timeline.publishedAt) },
          {
            key: 'clarifications',
            label: t('Clarifications close'),
            children: formatDate(timeline.clarificationDeadlineAt),
          },
          {
            key: 'deadline',
            label: t('Submission deadline'),
            children: <Text strong>{formatDate(timeline.deadlineAt)}</Text>,
          },
          { key: 'value', label: t('Estimated value'), children: formatAmount(commercials.estimatedValue) },
          { key: 'security', label: t('Bid security'), children: formatAmount(commercials.bidSecurity) },
          {
            key: 'validity',
            label: t('Bid validity'),
            children:
              commercials.bidValidityDays === undefined
                ? t('not stated')
                : `${commercials.bidValidityDays} ${t('days')}`,
          },
          {
            key: 'duration',
            label: t('Contract duration'),
            children:
              commercials.contractDurationMonths === undefined
                ? t('not stated')
                : `${commercials.contractDurationMonths} ${t('months')}`,
          },
          { key: 'evaluation', label: t('Evaluation'), children: formatEvaluation(requirements.evaluation) },
          { key: 'channel', label: t('Submission channel'), children: submission.channel ?? t('not stated') },
          { key: 'lots', label: t('Lots'), children: submission.lotCount ?? 1 },
          { key: 'consortium', label: t('Consortium referenced'), children: yesNo(submission.requiresConsortium, t) },
          { key: 'siteVisit', label: t('Mandatory site visit'), children: yesNo(submission.requiresSiteVisit, t) },
        ]}
      />

      {brief.risks.length > 0 && (
        <Alert type="warning" showIcon message={t('Risks')} description={bulletList(brief.risks)} />
      )}

      {brief.checklist.length > 0 && (
        <section>
          <Title level={5}>{t('Checklist')}</Title>
          {bulletList(brief.checklist)}
        </section>
      )}

      <Collapse
        size="small"
        items={[
          {
            key: 'eligibility',
            label: `${t('Eligibility')} (${requirements.eligibility.length})`,
            children: requirements.eligibility.length ? (
              bulletList(requirements.eligibility)
            ) : (
              <Text type="secondary">{t('Not stated in the notice - read the tender document.')}</Text>
            ),
          },
          {
            key: 'documents',
            label: `${t('Mandatory documents')} (${requirements.mandatoryDocuments.length})`,
            children: requirements.mandatoryDocuments.length ? (
              bulletList(requirements.mandatoryDocuments)
            ) : (
              <Text type="secondary">{t('Not stated in the notice - read the tender document.')}</Text>
            ),
          },
        ]}
      />

      {/* The most important part of the panel: absence of a value is not a claim. */}
      <section>
        <Title level={5}>{t('Not found in the notice')}</Title>
        {brief.gaps.length ? (
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {brief.gaps.join(', ')}
          </Paragraph>
        ) : (
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {t('Everything the extractor looks for was found.')}
          </Paragraph>
        )}
        <Text type="secondary" italic>
          {t('Extracted by rule, not read by a person. Confirm against the tender document before bidding.')}
        </Text>
      </section>
    </Space>
  );
};

/** Shown when the column is empty or holds something that is not a brief. */
export const BidBriefEmpty: React.FC<{ description: string }> = ({ description }) => (
  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description} />
);
