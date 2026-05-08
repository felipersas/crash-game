import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, Injectable } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { Round, RoundStatus } from '@/domain/entities/round.entity';

/**
 * WebSocket Events - Server to Client only (push)
 */
export interface ServerToClientEvents {
  roundStarted: (data: { roundId: string; seedHash: string; bettingEndTime: Date }) => void;
  bettingEnded: (data: { roundId: string }) => void;
  multiplierUpdate: (data: { roundId: string; multiplier: number }) => void;
  crash: (data: { roundId: string; crashPoint: number; seed: string }) => void;
  betPlaced: (data: { roundId: string; playerId: string; amountCents: bigint }) => void;
  playerCashedOut: (data: { roundId: string; playerId: string; multiplier: number; payoutCents: bigint }) => void;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class GamesGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
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
  broadcastBetPlaced(roundId: string, playerId: string, amountCents: bigint) {
    this.server.emit('betPlaced', {
      roundId,
      playerId,
      amountCents,
    });
  }

  /**
   * Broadcast player cashed out event.
   */
  broadcastPlayerCashedOut(
    roundId: string,
    playerId: string,
    multiplier: number,
    payoutCents: bigint,
  ) {
    this.server.emit('playerCashedOut', {
      roundId,
      playerId,
      multiplier,
      payoutCents,
    });
  }
}
