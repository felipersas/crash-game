import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { GamesController } from './presentation/controllers/games.controller';
import { PrismaModule } from './infrastructure/persistence/prisma/prisma.module';
import { PrismaService } from './infrastructure/persistence/prisma/prisma.service';
import { PrismaRoundRepository } from './infrastructure/persistence/prisma/round.repository.impl';
import { PrismaBetRepository } from './infrastructure/persistence/prisma/bet.repository.impl';
import { RabbitMQEventPublisher } from './infrastructure/messaging/rabbitmq/event-publisher.impl';
import { WalletEventsController } from './infrastructure/messaging/rabbitmq/wallet-events.controller';
import { WalletDebitedEventHandler } from './infrastructure/messaging/rabbitmq/handlers/wallet-debited.handler';
import { WalletDebitFailedEventHandler } from './infrastructure/messaging/rabbitmq/handlers/wallet-debit-failed.handler';
import { OutboxProcessor } from './infrastructure/messaging/rabbitmq/outbox-processor';
import { RoundLifecycleManager } from './infrastructure/scheduling/round-lifecycle-manager';
import { RoundCrashHandler } from './infrastructure/scheduling/round-crash-handler';
import { RedisService } from './infrastructure/redis/redis.service';
import { PlaceBetUseCase } from './application/use-cases/place-bet.use-case';
import { CashOutUseCase } from './application/use-cases/cash-out.use-case';
import { GetCurrentRoundUseCase } from './application/use-cases/get-current-round.use-case';
import { GetRoundHistoryUseCase } from './application/use-cases/get-round-history.use-case';
import { VerifyRoundUseCase } from './application/use-cases/verify-round.use-case';
import { ConfirmBetUseCase } from './application/use-cases/confirm-bet.use-case';
import { CancelBetUseCase } from './application/use-cases/cancel-bet.use-case';
import { GetBetStatusUseCase } from './application/use-cases/get-bet-status.use-case';
import { GetMyBetsUseCase } from './application/use-cases/get-my-bets.use-case';
import { BetTimeoutHandler } from './infrastructure/scheduling/bet-timeout.handler';
import {
  ROUND_REPOSITORY,
  BET_REPOSITORY,
  EVENT_PUBLISHER,
  SEED_CHAIN_REPOSITORY,
  GAMES_GATEWAY,
  GAME_BROADCASTER,
  IDEMPOTENCY_CACHE,
  ROUND_STATE_PROVIDER,
} from './infrastructure/di/tokens';
import { GamesGateway } from './infrastructure/websocket/games.gateway';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './infrastructure/filters/all-exceptions.filter';
import { FileSeedChainRepository } from './infrastructure/persistence/file/seed-chain.repository.impl';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
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
    // Infrastructure
    PrismaService,
    {
      provide: GAMES_GATEWAY,
      useClass: GamesGateway,
    },
    {
      provide: GAME_BROADCASTER,
      useExisting: GAMES_GATEWAY,
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
    // Messaging
    {
      provide: EVENT_PUBLISHER,
      useClass: RabbitMQEventPublisher,
    },
    WalletDebitedEventHandler,
    WalletDebitFailedEventHandler,
    OutboxProcessor,
    RedisService,
    {
      provide: IDEMPOTENCY_CACHE,
      useExisting: RedisService,
    },
    RoundCrashHandler,
    RoundLifecycleManager,
    {
      provide: ROUND_STATE_PROVIDER,
      useExisting: RoundLifecycleManager,
    },
    // Scheduled Jobs
    BetTimeoutHandler,
    // Use Cases
    PlaceBetUseCase,
    CashOutUseCase,
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
