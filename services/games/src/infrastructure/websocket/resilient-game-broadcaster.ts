import { Injectable, Logger, Inject } from '@nestjs/common';
import { GAMES_GATEWAY } from '@/application/di.tokens';
import type { IGameBroadcaster } from '@/application/interfaces/game-broadcaster';

@Injectable()
export class ResilientGameBroadcaster implements IGameBroadcaster {
  private readonly logger = new Logger(ResilientGameBroadcaster.name);

  constructor(@Inject(GAMES_GATEWAY) private readonly gateway: IGameBroadcaster) {}

  broadcastRoundStarted(roundId: string, seedHash: string, bettingEndTime: Date): void {
    this.safeCall('round started', () =>
      this.gateway.broadcastRoundStarted(roundId, seedHash, bettingEndTime),
    );
  }

  broadcastBettingEnded(roundId: string): void {
    this.safeCall('betting ended', () => this.gateway.broadcastBettingEnded(roundId));
  }

  broadcastCrash(roundId: string, crashPoint: number, seed: string): void {
    this.safeCall('crash', () => this.gateway.broadcastCrash(roundId, crashPoint, seed));
  }

  broadcastBetPlaced(
    roundId: string,
    betId: string,
    playerId: string,
    playerName: string,
    amountCents: bigint,
  ): void {
    this.safeCall('bet placed', () =>
      this.gateway.broadcastBetPlaced(roundId, betId, playerId, playerName, amountCents),
    );
  }

  broadcastBetConfirmed(
    roundId: string,
    betId: string,
    playerId: string,
    playerName: string,
    amountCents: bigint,
  ): void {
    this.safeCall('bet confirmed', () =>
      this.gateway.broadcastBetConfirmed(roundId, betId, playerId, playerName, amountCents),
    );
  }

  broadcastBetCancelled(
    roundId: string,
    betId: string,
    playerId: string,
    playerName: string,
    amountCents: bigint,
    reason: string,
  ): void {
    this.safeCall('bet cancelled', () =>
      this.gateway.broadcastBetCancelled(roundId, betId, playerId, playerName, amountCents, reason),
    );
  }

  broadcastPlayerCashedOut(
    roundId: string,
    betId: string,
    playerId: string,
    playerName: string,
    multiplier: number,
    payoutCents: bigint,
  ): void {
    this.safeCall('player cashed out', () =>
      this.gateway.broadcastPlayerCashedOut(
        roundId,
        betId,
        playerId,
        playerName,
        multiplier,
        payoutCents,
      ),
    );
  }

  private safeCall(label: string, fn: () => void): void {
    try {
      fn();
    } catch (error) {
      this.logger.error(`Failed to broadcast ${label}`, error);
    }
  }
}
