import type { IEventPublisher } from '@crash/messaging';
import type { GameDomainEvent } from '@/domain/events/round.events';

/**
 * Re-export IEventPublisher from shared package with Games domain events.
 */
export type IGameEventPublisher = IEventPublisher<GameDomainEvent>;

/**
 * Default export for easier injection
 */
export { IEventPublisher };
