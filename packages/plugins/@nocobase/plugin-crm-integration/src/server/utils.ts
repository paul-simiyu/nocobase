/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type Database from '@nocobase/database';
import type { Transaction, Transactionable } from '@nocobase/database';

/**
 * Run `fn` inside the caller's transaction when there is one, otherwise open and own a new
 * one. Business change and outbox row must land together or not at all.
 */
export async function withTransaction<T>(
  db: Database,
  options: Transactionable | undefined,
  fn: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  if (options?.transaction) {
    return fn(options.transaction);
  }
  const transaction = await db.sequelize.transaction();
  try {
    const result = await fn(transaction);
    await transaction.commit();
    return result;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
