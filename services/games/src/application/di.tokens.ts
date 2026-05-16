/**
 * Dependency Injection Tokens - Application Layer
 *
 * Constants for dependency injection.
 * Defined in the application layer so use cases can reference them
 * without depending on infrastructure.
 */

export const ROUND_REPOSITORY = 'ROUND_REPOSITORY';
export const BET_REPOSITORY = 'BET_REPOSITORY';
export const EVENT_PUBLISHER = 'EVENT_PUBLISHER';
export const RABBITMQ_PUBLISHER = 'RABBITMQ_PUBLISHER';
export const GAMES_GATEWAY = 'GAMES_GATEWAY';
export const GAME_BROADCASTER = 'GAME_BROADCASTER';
export const ROUND_STATE_PROVIDER = 'ROUND_STATE_PROVIDER';
export const SEED_CHAIN_REPOSITORY = 'SEED_CHAIN_REPOSITORY';
export const INBOX_REPOSITORY = 'INBOX_REPOSITORY';
export const AUTO_CASHOUT_REPOSITORY = 'AUTO_CASHOUT_REPOSITORY';
export const ROUND_CACHE_REPOSITORY = 'ROUND_CACHE_REPOSITORY';
