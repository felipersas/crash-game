import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { IBetRepository } from '@/application/interfaces/bet.repository';
import { BET_REPOSITORY } from '@/infrastructure/di/tokens';
import { type CancelBetUseCase } from '@/application/use-cases/cancel-bet.use-case';

/**
 * Bet Timeout Handler - Infrastructure Layer
 *
 * Scheduled job that cancels bets stuck in PENDING state.
 * Runs every 30 seconds to find and cancel bets that haven't been
 * confirmed by the wallet service within the timeout period.
 *
 * This provides resilience against:
 * - Wallet service being temporarily down
 * - Message delivery failures
 * - Orphaned PENDING bets
 */
@Injectable()
export class BetTimeoutHandler {
  private readonly logger = new Logger(BetTimeoutHandler.name);

  /**
   * Bets in PENDING state older than this are considered stale.
   * Should be longer than the expected wallet response time.
   * Default: 30 seconds
   */
  private readonly PENDING_TIMEOUT_MS = 30_000;

  constructor(
    @Inject(BET_REPOSITORY) private readonly betRepository: IBetRepository,
    private readonly cancelBetUseCase: CancelBetUseCase,
  ) {}

  /**
   * Run every 30 seconds to cancel stale PENDING bets.
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async cancelStalePendingBets(): Promise<void> {
    try {
      const staleThreshold = new Date(Date.now() - this.PENDING_TIMEOUT_MS);

      // Find PENDING bets older than the stale threshold
      const staleBets = await this.betRepository.findStalePendingBets(staleThreshold);

      let cancelledCount = 0;

      for (const bet of staleBets) {
        await this.cancelBetUseCase.execute({
          roundId: bet.roundId,
          betId: bet.id,
          playerId: bet.playerId,
          reason: 'Wallet confirmation timeout - bet was not confirmed within expected time',
        });

        cancelledCount++;
      }

      if (cancelledCount > 0) {
        this.logger.warn(`Cancelled ${cancelledCount} stale PENDING bets`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to cancel stale PENDING bets: ${errorMessage}`);
    }
  }
}
