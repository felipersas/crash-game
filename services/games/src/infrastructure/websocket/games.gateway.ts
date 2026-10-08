import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Logger, Injectable, Inject } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import { MetricsRecorderService, METRICS_RECORDER } from '@crash/observability';
import type {
  BetBroadcast,
  BetCancelledBroadcast,
  CrashBroadcast,
  IGameBroadcaster,
  PlayerCashedOutBroadcast,
  RoundStartedBroadcast,
} from '@/application/interfaces/game-broadcaster';

/**
 * Wire payloads: money travels as integer cents (JSON number).
 */
type BetPayload = Omit<BetBroadcast, 'amountCents'> & { amountCents: number };

/**
 * WebSocket Events - Server to Client only (push)
 */
export interface ServerToClientEvents {
  roundStarted: (data: RoundStartedBroadcast) => void;
  bettingEnded: (data: { roundId: string }) => void;
  multiplierUpdate: (data: { roundId: string; multiplier: number }) => void;
  crash: (data: CrashBroadcast) => void;
  betPlaced: (data: BetPayload) => void;
  betConfirmed: (data: BetPayload) => void;
  betCancelled: (data: BetPayload & { reason: string }) => void;
  playerCashedOut: (
    data: Omit<PlayerCashedOutBroadcast, 'payoutCents'> & { payoutCents: number },
  ) => void;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:5173'],
  },
})
export class GamesGateway implements OnGatewayConnection, OnGatewayDisconnect, IGameBroadcaster {
  @WebSocketServer()
  server!: Server<Record<string, never>, ServerToClientEvents>;

  private readonly logger = new Logger(GamesGateway.name);

  constructor(@Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    this.metrics.setWsConnections(this.server.sockets.sockets.size);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.metrics.setWsConnections(this.server.sockets.sockets.size);
  }

  broadcastRoundStarted(data: RoundStartedBroadcast) {
    this.server.emit('roundStarted', data);
    this.metrics.incrWsBroadcast('round_started');
  }

  broadcastBettingEnded(roundId: string) {
    this.server.emit('bettingEnded', { roundId });
    this.metrics.incrWsBroadcast('betting_ended');
  }

  broadcastMultiplierUpdate(roundId: string, multiplier: number) {
    this.server.emit('multiplierUpdate', { roundId, multiplier });
    this.metrics.incrWsBroadcast('multiplier_update');
  }

  broadcastCrash(data: CrashBroadcast) {
    this.server.emit('crash', data);
    this.metrics.incrWsBroadcast('crash');
  }

  broadcastBetPlaced(data: BetBroadcast) {
    this.server.emit('betPlaced', toBetPayload(data));
    this.metrics.incrWsBroadcast('bet_placed');
  }

  broadcastBetConfirmed(data: BetBroadcast) {
    this.server.emit('betConfirmed', toBetPayload(data));
    this.metrics.incrWsBroadcast('bet_confirmed');
  }

  broadcastBetCancelled(data: BetCancelledBroadcast) {
    this.server.emit('betCancelled', { ...toBetPayload(data), reason: data.reason });
    this.metrics.incrWsBroadcast('bet_cancelled');
  }

  broadcastPlayerCashedOut(data: PlayerCashedOutBroadcast) {
    this.server.emit('playerCashedOut', { ...data, payoutCents: Number(data.payoutCents) });
    this.metrics.incrWsBroadcast('player_cashed_out');
  }
}

function toBetPayload({
  roundId,
  betId,
  playerId,
  playerName,
  amountCents,
}: BetBroadcast): BetPayload {
  return { roundId, betId, playerId, playerName, amountCents: Number(amountCents) };
}
