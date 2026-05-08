import { Inject, Injectable, Logger } from '@nestjs/common';
import { Round, RoundStatus } from '@/domain/entities/round.entity';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import type { IGameEventPublisher } from '@/application/interfaces/event-publisher';
import { ROUND_REPOSITORY, EVENT_PUBLISHER } from '@/infrastructure/di/tokens';
import type { MultiplierUpdateJob } from '../jobs/round-job.types';

/**
 * Multiplier Update Handler
 *
 * Updates the multiplier during ACTIVE phase.
 * Recursively scheduled every 100ms until crash.
 */
@Injectable()
export class MultiplierUpdateHandler {
  private readonly logger = new Logger(MultiplierUpdateHandler.name);

  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IGameEventPublisher,
  ) {}

  /**
   * Handle the multiplier-update job.
   */
  async handle(job: MultiplierUpdateJob): Promise<void> {
    const { roundId, expectedVersion, updateNumber } = job;

    // Load round
    const round = await this.roundRepository.findById(roundId);
    if (!round) {
      this.logger.debug(`Round ${roundId} not found, skipping multiplier update`);
      return;
    }

    // Idempotency check via version
    if (round.getVersion() !== expectedVersion) {
      this.logger.debug(
        `Round ${roundId} version mismatch (expected ${expectedVersion}, got ${round.getVersion()}), skipping update`,
      );
      return;
    }

    // State check
    if (round.getStatus() !== RoundStatus.ACTIVE) {
      this.logger.debug(
        `Round ${roundId} is not in ACTIVE phase (current: ${round.getStatus()}), skipping update`,
      );
      return;
    }

    // Calculate elapsed time
    const startedAt = round.getStartedAt();
    if (!startedAt) {
      this.logger.warn(`Round ${roundId} has no startedAt time, skipping update`);
      return;
    }

    const elapsedSeconds = (Date.now() - startedAt.getTime()) / 1000;

    // Update multiplier
    round.updateMultiplier(elapsedSeconds);
    await this.roundRepository.save(round);

    // Publish events (includes multiplier updates if any)
    const events = round.pullEvents();
    if (events.length > 0) {
      await this.eventPublisher.publishBatch(events);
    }

    this.logger.debug(
      `Round ${roundId} update #${updateNumber}: multiplier = ${round.getCurrentMultiplier().toFixed(2)}x`,
    );

    // Check if round crashed
    if (round.getStatus() === RoundStatus.CRASHED) {
      this.logger.log(
        `Round ${roundId} crashed at ${round.getCrashPoint()}x after ${updateNumber} updates`,
      );
      return; // Stop scheduling updates
    }

    // Re-schedule next update (will be done by consumer/producer wrapper)
  }
}
