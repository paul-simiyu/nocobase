/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { FieldModel } from '@nocobase/client';
import { DisplayItemModel, tExpr } from '@nocobase/flow-engine';
import React from 'react';
import { NAMESPACE } from '../constants';
import { isBidBrief } from '../shared/summary';
import { BidBriefEmpty, BidBriefPanel } from './BidBriefPanel';

/**
 * Renders the `bidBrief` JSON column as a readable panel.
 *
 * Bound to the `json` interface but not as the default, so the generic JSON
 * viewer still handles every other JSON field; pick this model on the Bid brief
 * field itself.
 */
export class BidBriefFieldModel extends FieldModel {
  private translate(key: string): string {
    return this.flowEngine.translate(key, { ns: [NAMESPACE, 'client'], nsMode: 'fallback' });
  }

  render() {
    const t = (key: string) => this.translate(key);
    const { value } = this.props;

    if (value === undefined || value === null || value === '') {
      return <BidBriefEmpty description={t('No bid brief yet. Run a harvest to build one.')} />;
    }

    if (!isBidBrief(value)) {
      return <BidBriefEmpty description={t('This field does not hold a bid brief.')} />;
    }

    return <BidBriefPanel brief={value} t={t} />;
  }
}

BidBriefFieldModel.define({
  label: tExpr('Bid brief', { ns: NAMESPACE, nsMode: 'fallback' }),
});

DisplayItemModel.bindModelToInterface('BidBriefFieldModel', ['json'], {
  isDefault: false,
});
