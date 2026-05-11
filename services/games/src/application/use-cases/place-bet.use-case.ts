import { Inject, Injectable, Logger } from '@nestjs/common';
import { Round, type RoundStatus, DEFAULT_ROUND_CONFIG } from '@/domain/entities/round.entity';
import type { Bet } from '@/domain/entities/bet.entity';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import type { IBetRepository } from '@/application/interfaces/bet.repository';
import type { IGameEventPublisher } from '@/application/interfaces/event-publisher';
import type { IUseCase } from '@/application/interfaces/use-case';
import { Money } from '@crash/domain';
import { MetricsRecorderService, METRICS_RECORDER } from '@crash/observability';
import {
  ROUND_REPOSITORY,
  BET_REPOSITORY,
  EVENT_PUBLISHER,
  GAME_BROADCASTER,
} from '@/application/di.tokens';
import type { IGameBroadcaster } from '@/application/interfaces/game-broadcaster';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { OutboxWriter } from '@/infrastructure/messaging/outbox-writer';

export interface PlaceBetInput {
  playerId: string;
  playerName: string;
  amountCents: bigint;
}

export interface PlaceBetOutput {
  roundId: string;
  betId: string;
  amountCents: bigint;
  status: RoundStatus;
}

@Injectable()
export class PlaceBetUseCase implements IUseCase<PlaceBetInput, PlaceBetOutput> {
  private readonly logger = new Logger(PlaceBetUseCase.name);

  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
    @Inject(BET_REPOSITORY) private readonly betRepository: IBetRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IGameEventPublisher,
    @Inject(GAME_BROADCASTER) private readonly broadcaster: IGameBroadcaster,
    @Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService,
    private readonly prisma: PrismaService,
    private readonly outboxWriter: OutboxWriter,
  ) {}

  async execute(input: PlaceBetInput): Promise<PlaceBetOutput> {
    const round = await this.getOrCreateRound();
    return this.placeBetOnRound(round, input);
  }

  private async getOrCreateRound(): Promise<Round> {
    const existing = await this.roundRepository.findCurrentRound();
    if (existing) return existing;

    const round = await Round.create(DEFAULT_ROUND_CONFIG);
    await this.persistWithOutbox(round, async (tx) => {
      await this.roundRepository.create(round, tx);
    });

    return round;
  }

  private async placeBetOnRound(round: Round, input: PlaceBetInput): Promise<PlaceBetOutput> {
    const amount = Money.fromCents(input.amountCents);
    const { bet, replacedBet } = round.placeOrReplaceBet(input.playerId, input.playerName, amount);

    this.handleReplacement(round, replacedBet, input);

    await this.persistWithOutbox(round, async (tx) => {
      if (replacedBet) {
        await this.betRepository.update(replacedBet, tx);
      }
      await this.betRepository.create(bet, tx);
    });

    this.metrics.incrBet('placed', Number(input.amountCents));

    this.broadcastBetPlaced(round, bet, input);

    return {
      roundId: round.id,
      betId: bet.id,
      amountCents: input.amountCents,
      status: round.getStatus(),
    };
  }

  private handleReplacement(round: Round, replacedBet: Bet | null, input: PlaceBetInput): void {
    if (!replacedBet) return;

    this.metrics.incrBet('cancelled', Number(replacedBet.getAmount().toCents()));

    try {
      this.broadcaster.broadcastBetCancelled(
        round.id,
        replacedBet.id,
        input.playerId,
        replacedBet.playerName,
        replacedBet.getAmount().toCents(),
        'Replaced by new bet attempt',
      );
    } catch (error) {
      this.logger.error('Failed to broadcast bet cancelled event (replaced)', error);
    }
  }

  private async persistWithOutbox(
    round: Round,
    persistFn: (tx: any) => Promise<void>,
  ): Promise<void> {
    const events = round.pullEvents();
    let outboxIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      await persistFn(tx);
      if (events.length > 0) {
        outboxIds = await this.outboxWriter.writeWithinTransaction(tx, round.id, events);
      }
    });

    if (events.length > 0 && outboxIds.length > 0) {
      await this.outboxWriter.tryImmediatePublish(events, outboxIds);
    }
  }

  private broadcastBetPlaced(round: Round, bet: Bet, input: PlaceBetInput): void {
    try {
      this.broadcaster.broadcastBetPlaced(
        round.id,
        bet.id,
        input.playerId,
        input.playerName,
        input.amountCents,
      );
    } catch (error) {
      this.logger.error('Failed to broadcast bet placed event', error);
    }
  }
}
