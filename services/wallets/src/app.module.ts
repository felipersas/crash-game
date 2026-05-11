import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ObservabilityModule } from '@crash/observability';
import { WalletsController } from '@/presentation/controllers/wallets.controller';
import { PrismaModule } from '@/infrastructure/persistence/prisma/prisma.module';
import { PrismaWalletRepository } from '@/infrastructure/persistence/prisma/wallet.repository.impl';
import { PrismaInboxRepository } from '@/infrastructure/persistence/prisma/inbox.repository.impl';
import { RabbitMQEventPublisher } from '@/infrastructure/messaging/rabbitmq/event-publisher.impl';
import { OutboxWriter } from '@/infrastructure/messaging/outbox-writer';
import { OutboxProcessor } from '@/infrastructure/messaging/rabbitmq/outbox-processor';
import { InboxProcessor } from '@/infrastructure/messaging/rabbitmq/inbox-processor';
import { GamesEventsController } from '@/infrastructure/messaging/rabbitmq/games-events.controller';
import { BetPlacedEventHandler } from '@/infrastructure/messaging/rabbitmq/handlers/bet-placed.handler';
import { PlayerCashedOutEventHandler } from '@/infrastructure/messaging/rabbitmq/handlers/player-cashed-out.handler';
import { DlqSetupService } from '@/infrastructure/messaging/rabbitmq/dlq-setup.service';
import { CreateWalletUseCase } from '@/application/use-cases/create-wallet.use-case';
import { GetWalletUseCase } from '@/application/use-cases/get-wallet.use-case';
import { CreditWalletUseCase } from '@/application/use-cases/credit-wallet.use-case';
import { DebitWalletUseCase } from '@/application/use-cases/debit-wallet.use-case';
import { PlayerWalletResolver } from '@/application/services/player-wallet-resolver.service';
import {
  WALLET_REPOSITORY,
  INBOX_REPOSITORY,
  RABBITMQ_PUBLISHER,
  PLAYER_WALLET_RESOLVER,
} from '@/application/di.tokens';
import { AllExceptionsFilter } from './infrastructure/filters/all-exceptions.filter';
import { MetricsInterceptor } from './infrastructure/interceptors/metrics.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ObservabilityModule,
    ScheduleModule.forRoot(),
    ClientsModule.register([
      {
        name: 'WALLET_EVENTS_CLIENT',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://admin:admin@localhost:5672'],
          exchange: 'wallet.events',
          exchangeType: 'fanout',
        },
      },
    ]),
  ],
  controllers: [WalletsController, GamesEventsController],
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
    // Repositories
    { provide: WALLET_REPOSITORY, useClass: PrismaWalletRepository },
    { provide: INBOX_REPOSITORY, useClass: PrismaInboxRepository },
    // Messaging
    {
      provide: RABBITMQ_PUBLISHER,
      useClass: RabbitMQEventPublisher,
    },
    OutboxWriter,
    DlqSetupService,
    BetPlacedEventHandler,
    PlayerCashedOutEventHandler,
    OutboxProcessor,
    InboxProcessor,
    // Application Services
    { provide: PLAYER_WALLET_RESOLVER, useClass: PlayerWalletResolver },
    // Use Cases
    CreateWalletUseCase,
    GetWalletUseCase,
    CreditWalletUseCase,
    DebitWalletUseCase,
  ],
})
export class AppModule {}
