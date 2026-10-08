/**
 * Wallets Service API
 *
 * Direct exports — uses shared apiClient with auto-auth.
 * No token passing needed.
 */

import { get } from './axios';
import { API_ENDPOINTS } from '@/constants/api';
import type { Wallet } from '@/types';

export function getWallet(): Promise<Wallet> {
  return get(API_ENDPOINTS.WALLETS.ME);
}
