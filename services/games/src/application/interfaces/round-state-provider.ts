/**
 * Round State Provider Interface - Application Layer
 *
 * Abstraction for accessing the current in-memory round.
 * Decouples use cases from the concrete RoundLifecycleManager.
 */

import type { Round } from '@/domain/entities/round.entity';

export interface IRoundStateProvider {
  getCurrentRound(): Round | null;
}
