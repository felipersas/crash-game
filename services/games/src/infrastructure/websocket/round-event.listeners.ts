import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { GamesGateway } from './games.gateway';
import { GAMES_GATEWAY } from '../di/tokens';
import type {
  RoundStartedEvent,
  BettingPhaseEndedEvent,
  BetPlacedEvent,
  PlayerCashedOutEvent,
  RoundCrashedEvent,
  BetConfirmedEvent,
  BetCancelledEvent,
} from '@/domain/events/round.events';

/**
 * Round Event Listeners
 *
 * Listens to domain events and broadcasts them via WebSocket.
 * Decoupled from business logic via event emitter.
 */
@Injectable()
export class RoundEventListeners {
  constructor(@Inject(GAMES_GATEWAY) private readonly gamesGateway: GamesGateway) {}

  /**
   * Broadcast round started event.
   */
  @OnEvent('RoundStarted')
  handleRoundStarted(event: RoundStartedEvent): void {
    this.gamesGateway.broadcastRoundStarted(
      event.roundId,
      event.seedHash,
      event.bettingEndTime,
    );
  }

  /**
   * Broadcast betting phase ended event.
   */
  @OnEvent('BettingPhaseEnded')
  handleBettingEnded(event: BettingPhaseEndedEvent): void {
    this.gamesGateway.broadcastBettingEnded(event.roundId);
  }

  /**
   * Broadcast bet placed event.
   */
  @OnEvent('BetPlaced')
  handleBetPlaced(event: BetPlacedEvent): void {
    this.gamesGateway.broadcastBetPlaced(
      event.roundId,
      event.playerId,
      event.amount,
    );
  }

  /**
   * Broadcast bet confirmed event - wallet successfully debited.
   */
  @OnEvent('BetConfirmed')
  handleBetConfirmed(event: BetConfirmedEvent): void {
    this.gamesGateway.broadcastBetConfirmed(
      event.roundId,
      event.betId,
      event.playerId,
      event.amount,
    );
  }

  /**
   * Broadcast bet cancelled event - wallet debit failed.
   */
  @OnEvent('BetCancelled')
  handleBetCancelled(event: BetCancelledEvent): void {
    this.gamesGateway.broadcastBetCancelled(
      event.roundId,
      event.betId,
      event.playerId,
      event.amount,
      event.reason,
    );
  }

  /**
   * Broadcast player cashed out event.
   */
  @OnEvent('PlayerCashedOut')
  handlePlayerCashedOut(event: PlayerCashedOutEvent): void {
    this.gamesGateway.broadcastPlayerCashedOut(
      event.roundId,
      event.playerId,
      event.cashOutMultiplier,
      event.winAmount,
    );
  }

  /**
   * Broadcast round crashed event.
   */
  @OnEvent('RoundCrashed')
  handleRoundCrashed(event: RoundCrashedEvent): void {
    this.gamesGateway.broadcastCrash(
      event.roundId,
      event.crashPoint,
      event.seed,
    );
  }
}
