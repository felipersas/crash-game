/**
 * Dependency Injection Tokens - Application Layer
 *
 * Constants for dependency injection.
 * Defined in the application layer so use cases can reference them
 * without depending on infrastructure.
 */

export const WALLET_REPOSITORY = 'WALLET_REPOSITORY';
export const INBOX_REPOSITORY = 'INBOX_REPOSITORY';
export const RABBITMQ_PUBLISHER = 'RABBITMQ_PUBLISHER';
export const PLAYER_WALLET_RESOLVER = 'PLAYER_WALLET_RESOLVER';
