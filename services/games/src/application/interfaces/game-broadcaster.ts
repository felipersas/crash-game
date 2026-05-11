/**
 * Game Broadcaster Interface - Application Layer
 *
 * Abstraction for broadcasting game events to connected clients.
 * Decouples use cases from the concrete WebSocket implementation.
 */

export interface IGameBroadcaster {
  broadcastBetPlaced(
    roundId: string,
    betId: string,
    playerId: string,
    playerName: string,
    amountCents: bigint,
  ): void;
  broadcastBetConfirmed(
    roundId: string,
    betId: string,
    playerId: string,
    playerName: string,
    amountCents: bigint,
  ): void;
  broadcastBetCancelled(
    roundId: string,
    betId: string,
    playerId: string,
    playerName: string,
    amountCents: bigint,
    reason: string,
  ): void;
  broadcastPlayerCashedOut(
    roundId: string,
    betId: string,
    playerId: string,
    playerName: string,
    multiplier: number,
    payoutCents: bigint,
  ): void;
}
