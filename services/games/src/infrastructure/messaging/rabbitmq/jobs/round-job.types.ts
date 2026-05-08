/**
 * Round Lifecycle Job Types
 *
 * Jobs exchanged via RabbitMQ delayed message exchange
 * to orchestrate the round lifecycle in a stateless manner.
 */

/**
 * Start a new round.
 * Scheduled after crash or on initialization.
 */
export interface StartRoundJob {
  type: 'start-round';
  timestamp: number;
}

/**
 * End the betting phase and transition to ACTIVE.
 * Scheduled 10 seconds after round starts.
 */
export interface EndBettingPhaseJob {
  type: 'end-betting-phase';
  roundId: string;
  expectedVersion: number; // For idempotency
  timestamp: number;
}

/**
 * Update the multiplier during ACTIVE phase.
 * Recursively scheduled every 100ms.
 */
export interface MultiplierUpdateJob {
  type: 'multiplier-update';
  roundId: string;
  expectedVersion: number; // For idempotency
  updateNumber: number; // For debugging
  timestamp: number;
}

/**
 * Recovery job to handle server restarts.
 * Checks for orphaned rounds and reschedules jobs.
 */
export interface RecoveryJob {
  type: 'recovery';
  timestamp: number;
}

/**
 * Union type for all round lifecycle jobs.
 */
export type RoundLifecycleJob =
  | StartRoundJob
  | EndBettingPhaseJob
  | MultiplierUpdateJob
  | RecoveryJob;

/**
 * Job metadata for tracking.
 */
export interface JobMetadata {
  jobId: string; // Unique identifier
  attempt: number; // Retry count
  maxAttempts: number;
}
