/**
 * Redis Service - Infrastructure Layer
 *
 * Provides fast, durable storage for current game state.
 * Redis is used as the primary store for the active round because:
 * - Sub-millisecond reads/writes
 * - Atomic operations
 * - Pub/Sub for real-time updates
 * - AOF persistence for durability
 *
 * PostgreSQL remains the source of truth for:
 * - Historical data
 * - Audit trail
 * - Crash state (after round ends)
 */

import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import type { IIdempotencyCache } from '@/application/interfaces/idempotency-cache';
import type { CashoutIdempotencyResult } from '@/application/interfaces/idempotency-cache';

export type { CashoutIdempotencyResult } from '@/application/interfaces/idempotency-cache';

/**
 * Round state stored in Redis
 */
export interface RoundState {
  id: string;
  status: string;
  crashPoint: number | null;
  currentMultiplier: number;
  bettingEndTime: string | null;
  startedAt: string | null;
  crashedAt: string | null;
  version: number;
  lastUpdatedAt: number; // Unix timestamp
}

/**
 * Redis service for managing active game state.
 */
@Injectable()
export class RedisService implements OnModuleDestroy, IIdempotencyCache {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private readonly DEFAULT_TTL = 300; // 5 minutes - rounds don't last longer

  constructor() {
    this.connect();
  }

  /**
   * Connect to Redis with retry logic.
   */
  private connect(): void {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    try {
      this.client = new Redis(redisUrl, {
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          this.logger.warn(`Redis connection lost, retrying in ${delay}ms (attempt ${times})`);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        enableOfflineQueue: true,
      });

      this.client.on('connect', () => {
        this.logger.log('Redis connected');
      });

      this.client.on('error', (error) => {
        this.logger.error(`Redis error: ${error.message}`);
      });

      this.client.on('close', () => {
        this.logger.warn('Redis connection closed');
      });

      this.client.on('reconnecting', () => {
        this.logger.log('Redis reconnecting...');
      });
    } catch (error) {
      this.logger.error(`Failed to initialize Redis: ${error}`);
    }
  }

  /**
   * Get the current round state from Redis.
   *
   * @param roundId - The round ID to fetch
   * @returns The round state or null if not found
   */
  async getCurrentRound(roundId: string): Promise<RoundState | null> {
    if (!this.client) {
      this.logger.warn('Redis not available, returning null');
      return null;
    }

    try {
      const key = this.getRoundKey(roundId);
      const data = await this.client.get(key);

      if (!data) {
        return null;
      }

      return JSON.parse(data) as RoundState;
    } catch (error) {
      this.logger.error(`Failed to get round ${roundId} from Redis: ${error}`);
      return null;
    }
  }

  /**
   * Set the current round state in Redis.
   *
   * @param roundId - The round ID
   * @param state - The round state to store
   * @param ttl - Optional TTL in seconds (defaults to 5 minutes)
   */
  async setCurrentRound(roundId: string, state: RoundState, ttl?: number): Promise<void> {
    if (!this.client) {
      this.logger.warn('Redis not available, skipping set');
      return;
    }

    try {
      const key = this.getRoundKey(roundId);
      const value = JSON.stringify({
        ...state,
        lastUpdatedAt: Date.now(),
      });

      await this.client.set(key, value, 'EX', ttl ?? this.DEFAULT_TTL);
    } catch (error) {
      this.logger.error(`Failed to set round ${roundId} in Redis: ${error}`);
    }
  }

  /**
   * Update just the multiplier for a round (atomic operation).
   *
   * @param roundId - The round ID
   * @param multiplier - The new multiplier value
   */
  async updateMultiplier(roundId: string, multiplier: number): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      const key = this.getRoundKey(roundId);
      await this.client.watch(key);

      const data = await this.client.get(key);
      if (!data) {
        this.client.unwatch();
        return;
      }

      const state = JSON.parse(data) as RoundState;
      state.currentMultiplier = multiplier;
      state.lastUpdatedAt = Date.now();

      const multi = this.client.multi();
      multi.set(key, JSON.stringify(state), 'EX', this.DEFAULT_TTL);
      await multi.exec();
    } catch (error) {
      this.logger.error(`Failed to update multiplier for round ${roundId}: ${error}`);
    }
  }

  /**
   * Delete a round from Redis (called after round crashes).
   *
   * @param roundId - The round ID to delete
   */
  async deleteRound(roundId: string): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      const key = this.getRoundKey(roundId);
      await this.client.del(key);
      this.logger.debug(`Deleted round ${roundId} from Redis`);
    } catch (error) {
      this.logger.error(`Failed to delete round ${roundId} from Redis: ${error}`);
    }
  }

  /**
   * Check if Redis is healthy.
   */
  async healthCheck(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Check if idempotency key exists and return cached result.
   * Returns null if key doesn't exist (first request).
   *
   * @param idempotencyKey - The idempotency key to check
   * @returns Cached result or null
   */
  async checkCashoutIdempotency(idempotencyKey: string): Promise<CashoutIdempotencyResult | null> {
    if (!this.client) {
      this.logger.warn('Redis not available for idempotency check');
      return null;
    }

    try {
      const key = this.getIdempotencyKey(idempotencyKey);
      const data = await this.client.get(key);

      if (!data) {
        return null;
      }

      return JSON.parse(data) as CashoutIdempotencyResult;
    } catch (error) {
      this.logger.error(`Failed to check idempotency for ${idempotencyKey}: ${error}`);
      return null; // Fail open - allow request to proceed
    }
  }

  /**
   * Store cashout result with idempotency key.
   * Uses SET NX (only set if not exists) for atomicity.
   *
   * @param idempotencyKey - The idempotency key
   * @param result - The cashout result to cache
   * @param ttl - Optional TTL in seconds (defaults to 5 minutes)
   * @returns true if successfully stored, false otherwise
   */
  async setCashoutIdempotency(
    idempotencyKey: string,
    result: CashoutIdempotencyResult,
    ttl?: number,
  ): Promise<boolean> {
    if (!this.client) {
      this.logger.warn('Redis not available for idempotency storage');
      return false;
    }

    try {
      const key = this.getIdempotencyKey(idempotencyKey);
      const value = JSON.stringify(result);

      const setResult = await this.client.set(key, value, 'EX', ttl ?? this.DEFAULT_TTL, 'NX');

      return setResult === 'OK';
    } catch (error) {
      this.logger.error(`Failed to set idempotency for ${idempotencyKey}: ${error}`);
      return false;
    }
  }

  /**
   * Get the Redis key for a round.
   */
  private getRoundKey(roundId: string): string {
    return `crash:round:${roundId}`;
  }

  /**
   * Get the Redis key for idempotency.
   */
  private getIdempotencyKey(idempotencyKey: string): string {
    return `crash:idempotency:cashout:${idempotencyKey}`;
  }

  /**
   * Cleanup on module destroy.
   */
  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.logger.log('Redis connection closed');
    }
  }
}
