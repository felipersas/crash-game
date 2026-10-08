import { Injectable, Logger, Inject } from '@nestjs/common';
import type {
  BetBroadcast,
  BetCancelledBroadcast,
  CrashBroadcast,
  IGameBroadcaster,
  PlayerCashedOutBroadcast,
  RoundStartedBroadcast,
} from '@/application/interfaces/game-broadcaster';
import { GAMES_GATEWAY } from '@/infrastructure/di.tokens';

/**
 * Decorates the WebSocket gateway so a failed broadcast is logged instead of
 * failing the use case that triggered it.
 */
@Injectable()
export class ResilientGameBroadcaster implements IGameBroadcaster {
  private readonly logger = new Logger(ResilientGameBroadcaster.name);

  constructor(@Inject(GAMES_GATEWAY) private readonly gateway: IGameBroadcaster) {}

  broadcastRoundStarted(data: RoundStartedBroadcast): void {
    this.safeCall('round started', () => this.gateway.broadcastRoundStarted(data));
  }

  broadcastBettingEnded(roundId: string): void {
    this.safeCall('betting ended', () => this.gateway.broadcastBettingEnded(roundId));
  }

  broadcastMultiplierUpdate(roundId: string, multiplier: number): void {
    this.safeCall('multiplier update', () =>
      this.gateway.broadcastMultiplierUpdate(roundId, multiplier),
    );
  }

  broadcastCrash(data: CrashBroadcast): void {
    this.safeCall('crash', () => this.gateway.broadcastCrash(data));
  }

  broadcastBetPlaced(data: BetBroadcast): void {
    this.safeCall('bet placed', () => this.gateway.broadcastBetPlaced(data));
  }

  broadcastBetConfirmed(data: BetBroadcast): void {
    this.safeCall('bet confirmed', () => this.gateway.broadcastBetConfirmed(data));
  }

  broadcastBetCancelled(data: BetCancelledBroadcast): void {
    this.safeCall('bet cancelled', () => this.gateway.broadcastBetCancelled(data));
  }

  broadcastPlayerCashedOut(data: PlayerCashedOutBroadcast): void {
    this.safeCall('player cashed out', () => this.gateway.broadcastPlayerCashedOut(data));
  }

  private safeCall(label: string, fn: () => void): void {
    try {
      fn();
    } catch (error) {
      this.logger.error(`Failed to broadcast ${label}`, error);
    }
  }
}
