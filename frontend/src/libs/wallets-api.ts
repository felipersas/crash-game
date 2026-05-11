/**
 * Wallets Service API
 *
 * Direct exports — uses shared apiClient with auto-auth.
 * No token passing needed.
 */

import { get, post } from './axios';
import { API_ENDPOINTS } from '@/constants/api';
import type { Wallet } from '@/types/game.types';

export function createWallet(): Promise<Wallet> {
  return post(API_ENDPOINTS.WALLETS.CREATE);
}

export function getWallet(): Promise<Wallet> {
  return get(API_ENDPOINTS.WALLETS.ME);
}
