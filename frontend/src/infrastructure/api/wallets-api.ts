/**
 * Wallets Service API Client
 *
 * Handles wallet operations including balance queries and wallet creation.
 * All wallet operations require authentication.
 *
 * @example
 * ```ts
 * const api = createWalletsApi(session.accessToken);
 * const wallet = await api.getWallet();
 * console.log(`Balance: $${wallet.balance}`);
 * ```
 */

import type { AxiosInstance } from 'axios';
import { createHttpClient, get, post } from './http-client';
import { API_ENDPOINTS } from '../../shared/constants/api.constants';
import type { Wallet } from '../../domain/types/game.types';

/**
 * Wallets API client class
 *
 * @internal Prefer using createWalletsApi() factory function
 */
export class WalletsApi {
  private readonly client: AxiosInstance;

  /**
   * Creates a new WalletsApi instance
   *
   * @param accessToken - Current session access token for auth
   */
  constructor(accessToken?: string) {
    this.client = createHttpClient(accessToken);
  }

  /**
   * Create wallet for authenticated player
   *
   * Initializes a new wallet with zero balance.
   * Idempotent - returns existing wallet if already created.
   *
   * @returns Created wallet with walletId and initial balance
   * @throws {ApiError} On creation failures
   *
   * @example
   * ```ts
   * const wallet = await api.createWallet();
   * console.log(`Wallet ID: ${wallet.walletId}`);
   * ```
   */
  async createWallet(): Promise<Wallet> {
    return post(this.client, API_ENDPOINTS.WALLETS.CREATE);
  }

  /**
   * Get current player's wallet
   *
   * Returns wallet balance and metadata.
   * Balance is a decimal string for precision (e.g., "100.00").
   *
   * @returns Player wallet with current balance
   * @throws {ApiError} If wallet not found (404)
   *
   * @example
   * ```ts
   * const wallet = await api.getWallet();
   * console.log(`Balance: $${wallet.balance}`);
   * ```
   */
  async getWallet(): Promise<Wallet> {
    return get(this.client, API_ENDPOINTS.WALLETS.ME);
  }
}

/**
 * Factory function to create Wallets API instance
 *
 * @param accessToken - Current session access token
 * @returns Configured WalletsApi instance
 *
 * @example
 * ```ts
 * const api = createWalletsApi(session?.accessToken);
 * ```
 */
export function createWalletsApi(accessToken?: string): WalletsApi {
  return new WalletsApi(accessToken);
}
