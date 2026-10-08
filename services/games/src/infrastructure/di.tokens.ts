/**
 * Dependency Injection Tokens - Infrastructure Layer
 *
 * Tokens wired only between infrastructure components.
 */

export const RABBITMQ_PUBLISHER = 'RABBITMQ_PUBLISHER';
export const GAMES_EVENTS_CLIENT = 'GAMES_EVENTS_CLIENT';
export const GAMES_GATEWAY = 'GAMES_GATEWAY';
export const REDIS_CLIENT = 'REDIS_CLIENT';

export const CASHOUT_QUEUE = 'cashout';
export const CASHOUT_DLQ_QUEUE = 'cashout-dlq';
