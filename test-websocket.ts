import { io, type Socket } from 'socket.io-client';

// Event types matching the GamesGateway interface
interface RoundStartedEvent {
  roundId: string;
  seedHash: string;
  bettingEndTime: string;
}

interface BettingEndedEvent {
  roundId: string;
}

interface MultiplierUpdateEvent {
  roundId: string;
  multiplier: number;
}

interface CrashEvent {
  roundId: string;
  crashPoint: number;
  seed: string;
}

interface BetPlacedEvent {
  roundId: string;
  playerId: string;
  amountCents: bigint;
}

interface PlayerCashedOutEvent {
  roundId: string;
  playerId: string;
  multiplier: number;
  payoutCents: bigint;
}

const socket: Socket = io('http://localhost:4001', {
  transports: ['websocket', 'polling'],
  reconnection: true,
});

console.log('🔌 Connecting to WebSocket...');

socket.on('connect', (): void => {
  console.log('✅ Connected!', { id: socket.id, connected: socket.connected });
});

socket.on('connect_error', (error: Error): void => {
  console.error('❌ Connection error:', error.message);
});

socket.on('disconnect', (reason: string): void => {
  console.log('🔌 Disconnected:', reason);
});

socket.on('roundStarted', (data: RoundStartedEvent): void => {
  console.log('🎮 roundStarted:', JSON.stringify(data, null, 2));
});

socket.on('bettingEnded', (data: BettingEndedEvent): void => {
  console.log('⏰ bettingEnded:', JSON.stringify(data, null, 2));
});

socket.on('multiplierUpdate', (data: MultiplierUpdateEvent): void => {
  console.log('📈 multiplierUpdate:', JSON.stringify(data, null, 2));
});

socket.on('crash', (data: CrashEvent): void => {
  console.log('💥 crash:', JSON.stringify(data, null, 2));
});

socket.on('betPlaced', (data: BetPlacedEvent): void => {
  console.log('💰 betPlaced:', JSON.stringify(data, null, 2));
});

socket.on('playerCashedOut', (data: PlayerCashedOutEvent): void => {
  console.log('🏆 playerCashedOut:', JSON.stringify(data, null, 2));
});

// Listen to all events
socket.onAny((eventName: string, ...args: unknown[]): void => {
  console.log(`📩 Event received: ${eventName}`, args);
});

// Keep alive
setInterval((): void => {
  console.log('💓 Still connected:', socket.connected);
}, 10000);

console.log('⏳ Waiting for events... (Press Ctrl+C to exit)');
