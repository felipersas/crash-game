/**
 * Dependency Injection Tokens - Application Layer
 *
 * Tokens for the ports use cases depend on. Defined here so use cases can
 * reference them without depending on infrastructure.
 */

export const ROUND_REPOSITORY = 'ROUND_REPOSITORY';
export const BET_REPOSITORY = 'BET_REPOSITORY';
export const SEED_CHAIN_REPOSITORY = 'SEED_CHAIN_REPOSITORY';
export const INBOX_REPOSITORY = 'INBOX_REPOSITORY';
export const AUTO_CASHOUT_REPOSITORY = 'AUTO_CASHOUT_REPOSITORY';
export const UNIT_OF_WORK = 'UNIT_OF_WORK';
export const GAME_BROADCASTER = 'GAME_BROADCASTER';
export const ROUND_STATE_PROVIDER = 'ROUND_STATE_PROVIDER';
