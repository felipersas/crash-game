import { Inject, Injectable, Logger } from '@nestjs/common';
import { Round, DEFAULT_ROUND_CONFIG } from '@/domain/entities/round.entity';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import type { IGameEventPublisher } from '@/application/interfaces/event-publisher';
import { ROUND_REPOSITORY, EVENT_PUBLISHER } from '@/infrastructure/di/tokens';
import type { StartRoundJob } from '../jobs/round-job.types';

/**
 * Start Round Handler
 *
 * Creates a new round when no active round exists.
 * Scheduled after crash or on initialization.
 */
@Injectable()
export class StartRoundHandler {
  private readonly logger = new Logger(StartRoundHandler.name);

  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IGameEventPublisher,
  ) {}

  /**
   * Handle the start-round job.
   */
  async handle(): Promise<void> {
    // Check if there's already an active round
    const currentRound = await this.roundRepository.findCurrentRound();
    if (currentRound) {
      this.logger.debug(`Active round exists: ${currentRound.id}, skipping creation`);
      return;
    }

    // Create new round
    this.logger.log('Creating new round');
    const round = await Round.create(DEFAULT_ROUND_CONFIG);
    await this.roundRepository.create(round);

    // Publish events
    const events = round.pullEvents();
    if (events.length > 0) {
      await this.eventPublisher.publishBatch(events);
    }

    this.logger.log(`Round ${round.id} created in BETTING phase`);
  }
}
