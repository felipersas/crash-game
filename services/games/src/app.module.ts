import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ObservabilityModule } from '@crash/observability';
import { GamesController } from './presentation/controllers/games.controller';
import { PrismaModule } from './infrastructure/persistence/prisma/prisma.module';
import { PrismaService } from './infrastructure/persistence/prisma/prisma.service';
import { PrismaRoundRepository } from './infrastructure/persistence/prisma/round.repository.impl';
import { PrismaBetRepository } from './infrastructure/persistence/prisma/bet.repository.impl';
import { RabbitMQEventPublisher } from './infrastructure/messaging/rabbitmq/event-publisher.impl';
import { TransactionalEventPublisher } from './infrastructure/messaging/transactional-event-publisher';
import { OutboxWriter } from './infrastructure/messaging/outbox-writer';
import { WalletEventsController } from './infrastructure/messaging/rabbitmq/wallet-events.controller';
import { WalletDebitedEventHandler } from './infrastructure/messaging/rabbitmq/handlers/wallet-debited.handler';
import { WalletDebitFailedEventHandler } from './infrastructure/messaging/rabbitmq/handlers/wallet-debit-failed.handler';
import { OutboxProcessor } from './infrastructure/messaging/rabbitmq/outbox-processor';
import { InboxProcessor } from './infrastructure/messaging/rabbitmq/inbox-processor';
import { PrismaInboxRepository } from './infrastructure/persistence/prisma/inbox.repository.impl';
import { RoundLifecycleManager } from './infrastructure/scheduling/round-lifecycle-manager';
import { MetricsInterceptor } from './infrastructure/interceptors/metrics.interceptor';
import { PlaceBetUseCase } from './application/use-cases/place-bet.use-case';
import { CashOutUseCase } from './application/use-cases/cash-out.use-case';
import { GetCurrentRoundUseCase } from './application/use-cases/get-current-round.use-case';
import { GetRoundHistoryUseCase } from './application/use-cases/get-round-history.use-case';
import { VerifyRoundUseCase } from './application/use-cases/verify-round.use-case';
import { ConfirmBetUseCase } from './application/use-cases/confirm-bet.use-case';
import { CancelBetUseCase } from './application/use-cases/cancel-bet.use-case';
import { GetBetStatusUseCase } from './application/use-cases/get-bet-status.use-case';
import { GetMyBetsUseCase } from './application/use-cases/get-my-bets.use-case';
import { CreateRoundUseCase } from './application/use-cases/create-round.use-case';
import { StartRoundUseCase } from './application/use-cases/start-round.use-case';
import { CrashRoundUseCase } from './application/use-cases/crash-round.use-case';
import { BetTimeoutHandler } from './infrastructure/scheduling/bet-timeout.handler';
import {
  ROUND_REPOSITORY,
  BET_REPOSITORY,
  EVENT_PUBLISHER,
  RABBITMQ_PUBLISHER,
  SEED_CHAIN_REPOSITORY,
  GAMES_GATEWAY,
  GAME_BROADCASTER,
  ROUND_STATE_PROVIDER,
  INBOX_REPOSITORY,
} from './application/di.tokens';
import { GamesGateway } from './infrastructure/websocket/games.gateway';
import { ResilientGameBroadcaster } from './infrastructure/websocket/resilient-game-broadcaster';
import { AllExceptionsFilter } from './infrastructure/filters/all-exceptions.filter';
import { FileSeedChainRepository } from './infrastructure/persistence/file/seed-chain.repository.impl';
import { BullModule } from '@nestjs/bullmq';
import { RedisModule } from './infrastructure/redis/redis.module';
import { AutoCashOutWorker } from './infrastructure/workers/auto-cashout.worker';
import { CashoutDLQWorker } from './infrastructure/workers/cashout-dlq.worker';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    ObservabilityModule,
    PrismaModule,
    RedisModule,
    BullModule.registerQueue(
      {
        name: 'cashout',
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 500 },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      },
      { name: 'cashout-dlq' },
    ),
    ClientsModule.register([
      {
        name: 'GAMES_EVENTS_CLIENT',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://admin:admin@localhost:5672'],
          exchange: 'games.events',
          exchangeType: 'fanout',
        },
      },
    ]),
  ],
  controllers: [GamesController, WalletEventsController],
  providers: [
    // Exception Filter (global - handles all exceptions)
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    // Metrics Interceptor (global - records HTTP request metrics)
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
    // Infrastructure
    PrismaService,
    OutboxWriter,
    {
      provide: GAMES_GATEWAY,
      useClass: GamesGateway,
    },
    {
      provide: GAME_BROADCASTER,
      useClass: ResilientGameBroadcaster,
    },
    {
      provide: ROUND_REPOSITORY,
      useClass: PrismaRoundRepository,
    },
    {
      provide: BET_REPOSITORY,
      useClass: PrismaBetRepository,
    },
    {
      provide: SEED_CHAIN_REPOSITORY,
      useClass: FileSeedChainRepository,
    },
    // Messaging — EVENT_PUBLISHER writes to outbox, RABBITMQ_PUBLISHER publishes to RabbitMQ
    {
      provide: EVENT_PUBLISHER,
      useClass: TransactionalEventPublisher,
    },
    {
      provide: RABBITMQ_PUBLISHER,
      useClass: RabbitMQEventPublisher,
    },
    WalletDebitedEventHandler,
    WalletDebitFailedEventHandler,
    OutboxProcessor,
    InboxProcessor,
    {
      provide: INBOX_REPOSITORY,
      useClass: PrismaInboxRepository,
    },
    RoundLifecycleManager,
    {
      provide: ROUND_STATE_PROVIDER,
      useExisting: RoundLifecycleManager,
    },
    // Scheduled Jobs
    BetTimeoutHandler,
    // BullMQ Workers
    AutoCashOutWorker,
    CashoutDLQWorker,
    // Use Cases
    PlaceBetUseCase,
    CashOutUseCase,
    CreateRoundUseCase,
    StartRoundUseCase,
    CrashRoundUseCase,
    GetCurrentRoundUseCase,
    GetRoundHistoryUseCase,
    VerifyRoundUseCase,
    ConfirmBetUseCase,
    CancelBetUseCase,
    GetBetStatusUseCase,
    GetMyBetsUseCase,
  ],
  exports: [ROUND_REPOSITORY, BET_REPOSITORY, SEED_CHAIN_REPOSITORY],
})
export class AppModule {}
