/**
 * Dependency Injection Tokens - Infrastructure Layer
 *
 * NestJS injection tokens for infrastructure dependencies.
 */

import type { InjectionToken } from '@nestjs/common';

export const WALLET_REPOSITORY = Symbol('IWalletRepository');
export const EVENT_PUBLISHER = Symbol('IEventPublisher');
