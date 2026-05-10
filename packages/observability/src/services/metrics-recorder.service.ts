import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Gauge } from 'prom-client';

export const METRICS_RECORDER = 'METRICS_RECORDER';

@Injectable()
export class MetricsRecorderService {
  // Game metrics
  private readonly betsTotal: Counter;
  private readonly betAmountCents: Histogram;
  private readonly payoutCentsTotal: Counter;
  private readonly roundCrashPoint: Histogram;
  private readonly roundDurationSeconds: Histogram;
  private readonly activePlayers: Gauge;
  private readonly rtpPercentage: Gauge;

  // HTTP metrics
  private readonly httpRequestDuration: Histogram;
  private readonly httpRequestsTotal: Counter;

  // WebSocket metrics
  private readonly wsConnectionsActive: Gauge;
  private readonly wsEventsBroadcast: Counter;

  // RabbitMQ metrics
  private readonly rabbitmqPublished: Counter;
  private readonly rabbitmqConsumed: Counter;

  // Wallet metrics
  private readonly walletOperations: Counter;
  private readonly walletBalanceChange: Histogram;

  constructor() {
    // All metrics register on the global default registry
    // which @willsoto/nestjs-prometheus exposes at /metrics

    // --- Game Metrics ---
    this.betsTotal = new Counter({
      name: 'crash_game_bets_total',
      help: 'Total number of bets by status',
      labelNames: ['status'],
    });

    this.betAmountCents = new Histogram({
      name: 'crash_game_bet_amount_cents',
      help: 'Bet amount distribution in cents',
      labelNames: ['status'],
      buckets: [100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000],
    });

    this.payoutCentsTotal = new Counter({
      name: 'crash_game_payout_cents_total',
      help: 'Total payout amount in cents',
    });

    this.roundCrashPoint = new Histogram({
      name: 'crash_game_round_crash_point',
      help: 'Distribution of crash points',
      buckets: [1.0, 1.1, 1.2, 1.5, 2.0, 3.0, 5.0, 10.0, 25.0, 50.0, 100.0],
    });

    this.roundDurationSeconds = new Histogram({
      name: 'crash_game_round_duration_seconds',
      help: 'Round duration from start to crash',
      buckets: [1, 2, 5, 10, 15, 20, 30, 60, 120],
    });

    this.activePlayers = new Gauge({
      name: 'crash_game_active_players',
      help: 'Number of players with active bets',
    });

    this.rtpPercentage = new Gauge({
      name: 'crash_game_rtp_percentage',
      help: 'Return to player percentage (payouts / wagers * 100)',
    });

    // --- HTTP Metrics ---
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
    });

    // --- WebSocket Metrics ---
    this.wsConnectionsActive = new Gauge({
      name: 'ws_connections_active',
      help: 'Number of active WebSocket connections',
    });

    this.wsEventsBroadcast = new Counter({
      name: 'ws_events_broadcast_total',
      help: 'Total WebSocket events broadcast',
      labelNames: ['event_type'],
    });

    // --- RabbitMQ Metrics ---
    this.rabbitmqPublished = new Counter({
      name: 'rabbitmq_events_published_total',
      help: 'Total events published to RabbitMQ',
      labelNames: ['exchange', 'event_type'],
    });

    this.rabbitmqConsumed = new Counter({
      name: 'rabbitmq_events_consumed_total',
      help: 'Total events consumed from RabbitMQ',
      labelNames: ['queue', 'event_type'],
    });

    // --- Wallet Metrics ---
    this.walletOperations = new Counter({
      name: 'wallet_operations_total',
      help: 'Total wallet operations',
      labelNames: ['operation'],
    });

    this.walletBalanceChange = new Histogram({
      name: 'wallet_balance_change_cents',
      help: 'Wallet balance change amount in cents',
      labelNames: ['operation'],
      buckets: [100, 500, 1000, 2500, 5000, 10000, 50000, 100000],
    });
  }

  // --- Game Metrics ---

  incrBet(status: string, amountCents: number): void {
    this.betsTotal.inc({ status }, 1);
    this.betAmountCents.observe({ status }, amountCents);
  }

  incrPayout(amountCents: number): void {
    this.payoutCentsTotal.inc(amountCents);
  }

  observeCrashPoint(crashPoint: number): void {
    this.roundCrashPoint.observe(crashPoint);
  }

  observeRoundDuration(seconds: number): void {
    this.roundDurationSeconds.observe(seconds);
  }

  setActivePlayers(count: number): void {
    this.activePlayers.set(count);
  }

  setRtp(percentage: number): void {
    this.rtpPercentage.set(percentage);
  }

  // --- HTTP Metrics ---

  observeHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationSeconds: number,
  ): void {
    this.httpRequestDuration.observe(
      { method, route, status_code: String(statusCode) },
      durationSeconds,
    );
    this.httpRequestsTotal.inc(
      { method, route, status_code: String(statusCode) },
      1,
    );
  }

  // --- WebSocket Metrics ---

  setWsConnections(count: number): void {
    this.wsConnectionsActive.set(count);
  }

  incrWsBroadcast(eventType: string): void {
    this.wsEventsBroadcast.inc({ event_type: eventType }, 1);
  }

  // --- RabbitMQ Metrics ---

  incrRabbitPublished(exchange: string, eventType: string): void {
    this.rabbitmqPublished.inc({ exchange, event_type: eventType }, 1);
  }

  incrRabbitConsumed(queue: string, eventType: string): void {
    this.rabbitmqConsumed.inc({ queue, event_type: eventType }, 1);
  }

  // --- Wallet Metrics ---

  incrWalletOp(operation: string, amountCents: number): void {
    this.walletOperations.inc({ operation }, 1);
    this.walletBalanceChange.observe({ operation }, amountCents);
  }
}
