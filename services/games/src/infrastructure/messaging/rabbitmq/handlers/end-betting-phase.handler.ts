import { Inject, Injectable, Logger } from '@nestjs/common';
import { Round, RoundStatus } from '@/domain/entities/round.entity';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import type { IGameEventPublisher } from '@/application/interfaces/event-publisher';
import { ROUND_REPOSITORY, EVENT_PUBLISHER } from '@/infrastructure/di/tokens';
import type { EndBettingPhaseJob } from '../jobs/round-job.types';

/**
 * End Betting Phase Handler
 *
 * Transitions the round from BETTING to ACTIVE state.
 * Scheduled 10 seconds after round starts.
 */
@Injectable()
export class EndBettingPhaseHandler {
  private readonly logger = new Logger(EndBettingPhaseHandler.name);

  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IGameEventPublisher,
  ) {}

  /**
   * Handle the end-betting-phase job.
   */
  async handle(job: EndBettingPhaseJob): Promise<void> {
    const { roundId, expectedVersion } = job;

    // Load round
    const round = await this.roundRepository.findById(roundId);
    if (!round) {
      this.logger.warn(`Round ${roundId} not found, skipping end-betting-phase`);
      return;
    }

    // Idempotency check via version
    if (round.getVersion() !== expectedVersion) {
      this.logger.debug(
        `Round ${roundId} version mismatch (expected ${expectedVersion}, got ${round.getVersion()}), skipping`,
      );
      return;
    }

    // State check
    if (round.getStatus() !== RoundStatus.BETTING) {
      this.logger.debug(
        `Round ${roundId} is not in BETTING phase (current: ${round.getStatus()}), skipping`,
      );
      return;
    }

    // Transition to ACTIVE
    this.logger.log(`Ending betting phase for round ${roundId}`);
    await round.startRound();
    await this.roundRepository.save(round);

    // Publish events
    const events = round.pullEvents();
    if (events.length > 0) {
      await this.eventPublisher.publishBatch(events);
    }

    this.logger.log(`Round ${roundId} transitioned to ACTIVE phase`);
  }
}
