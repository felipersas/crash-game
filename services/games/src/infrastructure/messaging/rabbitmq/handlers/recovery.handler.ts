import { Inject, Injectable, Logger } from '@nestjs/common';
import { Round, RoundStatus } from '@/domain/entities/round.entity';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import { ROUND_REPOSITORY } from '@/infrastructure/di/tokens';
import type { RecoveryJob } from '../jobs/round-job.types';

/**
 * Recovery Handler
 *
 * Handles server restarts by checking for orphaned rounds
 * and ensuring proper job scheduling.
 */
@Injectable()
export class RecoveryHandler {
  private readonly logger = new Logger(RecoveryHandler.name);

  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
  ) {}

  /**
   * Handle the recovery job.
   *
   * This job runs periodically to ensure round lifecycle consistency.
   */
  async handle(): Promise<void> {
    this.logger.debug('Running recovery check');

    const currentRound = await this.roundRepository.findCurrentRound();

    if (!currentRound) {
      this.logger.debug('No active round found, recovery not needed');
      return;
    }

    const status = currentRound.getStatus();
    const now = Date.now();

    switch (status) {
      case RoundStatus.BETTING:
        await this.handleBettingRound(currentRound, now);
        break;

      case RoundStatus.ACTIVE:
        await this.handleActiveRound(currentRound, now);
        break;

      case RoundStatus.CRASHED:
        this.logger.debug(`Round ${currentRound.id} is crashed, awaiting cleanup`);
        break;
    }
  }

  /**
   * Handle a round in BETTING phase.
   */
  private async handleBettingRound(round: Round, now: number): Promise<void> {
    const bettingEndTime = round.getBettingEndTime();
    if (!bettingEndTime) {
      this.logger.warn(`Round ${round.id} has no betting end time`);
      return;
    }

    // If betting phase should have ended, log warning
    // The actual transition will happen when EndBettingPhaseJob runs
    if (now >= bettingEndTime.getTime()) {
      this.logger.warn(
        `Round ${round.id} betting phase should have ended at ${bettingEndTime.toISOString()}`,
      );
    }
  }

  /**
   * Handle a round in ACTIVE phase.
   */
  private async handleActiveRound(round: Round, now: number): Promise<void> {
    const startedAt = round.getStartedAt();
    if (!startedAt) {
      this.logger.warn(`Round ${round.id} is ACTIVE but has no startedAt time`);
      return;
    }

    const elapsed = (now - startedAt.getTime()) / 1000;

    // Log warning if round has been active too long (possible crash)
    if (elapsed > 60) {
      this.logger.warn(
        `Round ${round.id} has been active for ${elapsed.toFixed(1)}s, may be stuck`,
      );
    }
  }
}
