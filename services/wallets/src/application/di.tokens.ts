/**
 * Dependency Injection Tokens - Application Layer
 *
 * Tokens for the ports use cases depend on. Defined here so use cases can
 * reference them without depending on infrastructure.
 */

export const WALLET_REPOSITORY = 'WALLET_REPOSITORY';
export const INBOX_REPOSITORY = 'INBOX_REPOSITORY';
export const UNIT_OF_WORK = 'UNIT_OF_WORK';
