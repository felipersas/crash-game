import {
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type {
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, Injectable } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import type { IGameBroadcaster } from '@/application/interfaces/game-broadcaster';

/**
 * WebSocket Events - Server to Client only (push)
 */
export interface ServerToClientEvents {
  roundStarted: (data: { roundId: string; seedHash: string; bettingEndTime: Date }) => void;
  bettingEnded: (data: { roundId: string }) => void;
  multiplierUpdate: (data: { roundId: string; multiplier: number }) => void;
  crash: (data: { roundId: string; crashPoint: number; seed: string }) => void;
  betPlaced: (data: { roundId: string; betId: string; playerId: string; amountCents: number }) => void;
  betConfirmed: (data: { roundId: string; betId: string; playerId: string; amountCents: number }) => void;
  betCancelled: (data: { roundId: string; betId: string; playerId: string; amountCents: number; reason: string }) => void;
  playerCashedOut: (data: { roundId: string; betId: string; playerId: string; multiplier: number; payoutCents: number }) => void;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class GamesGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, IGameBroadcaster
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(GamesGateway.name);

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Broadcast round started event to all clients.
   */
  broadcastRoundStarted(roundId: string, seedHash: string, bettingEndTime: Date) {
    this.server.emit('roundStarted', {
      roundId,
      seedHash,
      bettingEndTime,
    });
  }

  /**
   * Broadcast betting phase ended event.
   */
  broadcastBettingEnded(roundId: string) {
    this.server.emit('bettingEnded', { roundId });
  }

  /**
   * Broadcast multiplier update during active round.
   */
  broadcastMultiplierUpdate(roundId: string, multiplier: number) {
    this.server.emit('multiplierUpdate', {
      roundId,
      multiplier,
    });
  }

  /**
   * Broadcast crash event.
   */
  broadcastCrash(roundId: string, crashPoint: number, seed: string) {
    this.server.emit('crash', {
      roundId,
      crashPoint,
      seed,
    });
  }

  /**
   * Broadcast bet placed event.
   */
  broadcastBetPlaced(roundId: string, betId: string, playerId: string, amountCents: bigint) {
    this.server.emit('betPlaced', {
      roundId,
      betId,
      playerId,
      amountCents: Number(amountCents),
    });
  }

  /**
   * Broadcast bet confirmed event - bet is now active after wallet confirmation.
   */
  broadcastBetConfirmed(roundId: string, betId: string, playerId: string, amountCents: bigint) {
    this.server.emit('betConfirmed', {
      roundId,
      betId,
      playerId,
      amountCents: Number(amountCents),
    });
  }

  /**
   * Broadcast bet cancelled event - bet was rejected by wallet service.
   */
  broadcastBetCancelled(roundId: string, betId: string, playerId: string, amountCents: bigint, reason: string) {
    this.server.emit('betCancelled', {
      roundId,
      betId,
      playerId,
      amountCents: Number(amountCents),
      reason,
    });
  }

  /**
   * Broadcast player cashed out event.
   */
  broadcastPlayerCashedOut(
    roundId: string,
    betId: string,
    playerId: string,
    multiplier: number,
    payoutCents: bigint,
  ) {
    this.server.emit('playerCashedOut', {
      roundId,
      betId,
      playerId,
      multiplier,
      payoutCents: Number(payoutCents),
    });
  }
}
