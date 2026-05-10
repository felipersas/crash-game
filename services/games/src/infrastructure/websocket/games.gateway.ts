import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Logger, Injectable } from '@nestjs/common';
import { type Server, type Socket } from 'socket.io';
import type { IGameBroadcaster } from '@/application/interfaces/game-broadcaster';

/**
 * WebSocket Events - Server to Client only (push)
 */
export interface ServerToClientEvents {
  roundStarted: (data: { roundId: string; seedHash: string; bettingEndTime: Date }) => void;
  bettingEnded: (data: { roundId: string }) => void;
  multiplierUpdate: (data: { roundId: string; multiplier: number }) => void;
  crash: (data: { roundId: string; crashPoint: number; seed: string }) => void;
  betPlaced: (data: {
    roundId: string;
    betId: string;
    playerId: string;
    playerName: string;
    amountCents: number;
  }) => void;
  betConfirmed: (data: {
    roundId: string;
    betId: string;
    playerId: string;
    playerName: string;
    amountCents: number;
  }) => void;
  betCancelled: (data: {
    roundId: string;
    betId: string;
    playerId: string;
    playerName: string;
    amountCents: number;
    reason: string;
  }) => void;
  playerCashedOut: (data: {
    roundId: string;
    betId: string;
    playerId: string;
    playerName: string;
    multiplier: number;
    payoutCents: number;
  }) => void;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:5173'],
  },
})
export class GamesGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, IGameBroadcaster
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(GamesGateway.name);

  afterInit(_server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  broadcastRoundStarted(roundId: string, seedHash: string, bettingEndTime: Date) {
    this.server.emit('roundStarted', {
      roundId,
      seedHash,
      bettingEndTime,
    });
  }

  broadcastBettingEnded(roundId: string) {
    this.server.emit('bettingEnded', { roundId });
  }

  broadcastMultiplierUpdate(roundId: string, multiplier: number) {
    this.server.emit('multiplierUpdate', {
      roundId,
      multiplier,
    });
  }

  broadcastCrash(roundId: string, crashPoint: number, seed: string) {
    this.server.emit('crash', {
      roundId,
      crashPoint,
      seed,
    });
  }

  broadcastBetPlaced(roundId: string, betId: string, playerId: string, playerName: string, amountCents: bigint) {
    this.server.emit('betPlaced', {
      roundId,
      betId,
      playerId,
      playerName,
      amountCents: Number(amountCents),
    });
  }

  broadcastBetConfirmed(roundId: string, betId: string, playerId: string, playerName: string, amountCents: bigint) {
    this.server.emit('betConfirmed', {
      roundId,
      betId,
      playerId,
      playerName,
      amountCents: Number(amountCents),
    });
  }

  broadcastBetCancelled(
    roundId: string,
    betId: string,
    playerId: string,
    playerName: string,
    amountCents: bigint,
    reason: string,
  ) {
    this.server.emit('betCancelled', {
      roundId,
      betId,
      playerId,
      playerName,
      amountCents: Number(amountCents),
      reason,
    });
  }

  broadcastPlayerCashedOut(
    roundId: string,
    betId: string,
    playerId: string,
    playerName: string,
    multiplier: number,
    payoutCents: bigint,
  ) {
    this.server.emit('playerCashedOut', {
      roundId,
      betId,
      playerId,
      playerName,
      multiplier,
      payoutCents: Number(payoutCents),
    });
  }
}
