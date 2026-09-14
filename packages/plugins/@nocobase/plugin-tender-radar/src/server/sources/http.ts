/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import axios, { type AxiosRequestConfig } from 'axios';

const DEFAULT_TIMEOUT = 30_000;

/**
 * Identifies the harvester to portal operators. Several procurement APIs ask
 * re-users to send a contactable agent string rather than a browser one.
 */
const USER_AGENT = 'NocoBase-TenderRadar/1.0 (+https://www.nocobase.com)';

export interface RequestOptions {
  params?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
  timeout?: number;
}

const config = (options: RequestOptions = {}): AxiosRequestConfig => ({
  params: options.params,
  timeout: options.timeout ?? DEFAULT_TIMEOUT,
  headers: { 'User-Agent': USER_AGENT, ...options.headers },
  // Portals occasionally answer 4xx with a JSON error body worth surfacing.
  validateStatus: (status) => status >= 200 && status < 300,
});

const describe = (error: unknown, url: string): Error => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    return new Error(`Request to ${url} failed${status ? ` with HTTP ${status}` : ''}: ${error.message}`);
  }
  return new Error(`Request to ${url} failed: ${String(error)}`);
};

export async function getJson(url: string, options?: RequestOptions): Promise<unknown> {
  try {
    const response = await axios.get<unknown>(url, config(options));
    return response.data;
  } catch (error) {
    throw describe(error, url);
  }
}

export async function postJson(url: string, body: unknown, options?: RequestOptions): Promise<unknown> {
  const base = config(options);
  try {
    const response = await axios.post<unknown>(url, body, {
      ...base,
      headers: { 'Content-Type': 'application/json', ...base.headers },
    });
    return response.data;
  } catch (error) {
    throw describe(error, url);
  }
}

export async function getText(url: string, options?: RequestOptions): Promise<string> {
  try {
    const response = await axios.get<string>(url, { ...config(options), responseType: 'text' });
    return typeof response.data === 'string' ? response.data : String(response.data);
  } catch (error) {
    throw describe(error, url);
  }
}
