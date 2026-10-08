import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AllExceptionsFilter } from '@crash/http';
import { MetricsInterceptor, ObservabilityModule } from '@crash/observability';
import {
  ROUND_REPOSITORY,
  BET_REPOSITORY,
  SEED_CHAIN_REPOSITORY,
  INBOX_REPOSITORY,
  UNIT_OF_WORK,
  GAME_BROADCASTER,
  ROUND_STATE_PROVIDER,
} from '@/application/di.tokens';
import { PlaceBetUseCase } from '@/application/use-cases/place-bet.use-case';
import { CashOutUseCase } from '@/application/use-cases/cash-out.use-case';
import { ConfirmBetUseCase } from '@/application/use-cases/confirm-bet.use-case';
import { CancelBetUseCase } from '@/application/use-cases/cancel-bet.use-case';
import { CreateRoundUseCase } from '@/application/use-cases/create-round.use-case';
import { StartRoundUseCase } from '@/application/use-cases/start-round.use-case';
import { CrashRoundUseCase } from '@/application/use-cases/crash-round.use-case';
import { GetCurrentRoundUseCase } from '@/application/use-cases/get-current-round.use-case';
import { GetRoundHistoryUseCase } from '@/application/use-cases/get-round-history.use-case';
import { GetBetStatusUseCase } from '@/application/use-cases/get-bet-status.use-case';
import { GetMyBetsUseCase } from '@/application/use-cases/get-my-bets.use-case';
import { VerifyRoundUseCase } from '@/application/use-cases/verify-round.use-case';
import {
  CASHOUT_DLQ_QUEUE,
  CASHOUT_QUEUE,
  GAMES_EVENTS_CLIENT,
  GAMES_GATEWAY,
  RABBITMQ_PUBLISHER,
} from '@/infrastructure/di.tokens';
import { GAMES_ERROR_STATUS } from '@/infrastructure/http/error-status';
import { PrismaModule } from '@/infrastructure/persistence/prisma/prisma.module';
import { PrismaRoundRepository } from '@/infrastructure/persistence/prisma/round.repository.impl';
import { PrismaBetRepository } from '@/infrastructure/persistence/prisma/bet.repository.impl';
import { PrismaInboxRepository } from '@/infrastructure/persistence/prisma/inbox.repository.impl';
import { PrismaUnitOfWork } from '@/infrastructure/persistence/prisma/prisma-unit-of-work';
import { FileSeedChainRepository } from '@/infrastructure/persistence/file/seed-chain.repository.impl';
import { OutboxWriter } from '@/infrastructure/messaging/outbox-writer';
import { RabbitMQEventPublisher } from '@/infrastructure/messaging/rabbitmq/event-publisher.impl';
import { OutboxProcessor } from '@/infrastructure/messaging/rabbitmq/outbox-processor';
import { WalletEventsController } from '@/infrastructure/messaging/rabbitmq/wallet-events.controller';
import { WalletDebitedEventHandler } from '@/infrastructure/messaging/rabbitmq/handlers/wallet-debited.handler';
import { WalletDebitFailedEventHandler } from '@/infrastructure/messaging/rabbitmq/handlers/wallet-debit-failed.handler';
import { IdempotentInbox } from '@/infrastructure/messaging/inbox/idempotent-inbox';
import { InboxProcessor } from '@/infrastructure/messaging/inbox/inbox-processor';
import { RedisModule } from '@/infrastructure/redis/redis.module';
import { RoundLifecycleManager } from '@/infrastructure/scheduling/round-lifecycle-manager';
import { BetTimeoutHandler } from '@/infrastructure/scheduling/bet-timeout.handler';
import { GamesGateway } from '@/infrastructure/websocket/games.gateway';
import { ResilientGameBroadcaster } from '@/infrastructure/websocket/resilient-game-broadcaster';
import { AutoCashOutWorker } from '@/infrastructure/workers/auto-cashout.worker';
import { CashoutDLQWorker } from '@/infrastructure/workers/cashout-dlq.worker';
import { GamesController } from '@/presentation/controllers/games.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ObservabilityModule,
    PrismaModule,
    RedisModule,
    BullModule.registerQueue(
      {
        name: CASHOUT_QUEUE,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 500 },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      },
      { name: CASHOUT_DLQ_QUEUE },
    ),
    ClientsModule.register([
      {
        name: GAMES_EVENTS_CLIENT,
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
    // HTTP cross-cutting concerns
    { provide: APP_FILTER, useValue: new AllExceptionsFilter(GAMES_ERROR_STATUS) },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },

    // Ports → adapters
    { provide: ROUND_REPOSITORY, useClass: PrismaRoundRepository },
    { provide: BET_REPOSITORY, useClass: PrismaBetRepository },
    { provide: INBOX_REPOSITORY, useClass: PrismaInboxRepository },
    { provide: SEED_CHAIN_REPOSITORY, useClass: FileSeedChainRepository },
    { provide: UNIT_OF_WORK, useClass: PrismaUnitOfWork },
    { provide: GAMES_GATEWAY, useClass: GamesGateway },
    { provide: GAME_BROADCASTER, useClass: ResilientGameBroadcaster },
    { provide: ROUND_STATE_PROVIDER, useExisting: RoundLifecycleManager },

    // Messaging
    { provide: RABBITMQ_PUBLISHER, useClass: RabbitMQEventPublisher },
    OutboxWriter,
    OutboxProcessor,
    IdempotentInbox,
    InboxProcessor,
    WalletDebitedEventHandler,
    WalletDebitFailedEventHandler,

    // Scheduling & workers
    RoundLifecycleManager,
    BetTimeoutHandler,
    AutoCashOutWorker,
    CashoutDLQWorker,

    // Use cases
    PlaceBetUseCase,
    CashOutUseCase,
    ConfirmBetUseCase,
    CancelBetUseCase,
    CreateRoundUseCase,
    StartRoundUseCase,
    CrashRoundUseCase,
    GetCurrentRoundUseCase,
    GetRoundHistoryUseCase,
    GetBetStatusUseCase,
    GetMyBetsUseCase,
    VerifyRoundUseCase,
  ],
})
export class AppModule {}
