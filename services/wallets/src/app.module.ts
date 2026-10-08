import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AllExceptionsFilter } from '@crash/http';
import { MetricsInterceptor, ObservabilityModule } from '@crash/observability';
import { WALLET_REPOSITORY, INBOX_REPOSITORY, UNIT_OF_WORK } from '@/application/di.tokens';
import { CreateWalletUseCase } from '@/application/use-cases/create-wallet.use-case';
import { GetWalletUseCase } from '@/application/use-cases/get-wallet.use-case';
import { CreditWalletUseCase } from '@/application/use-cases/credit-wallet.use-case';
import { DebitBetStakeUseCase } from '@/application/use-cases/debit-bet-stake.use-case';
import { RABBITMQ_PUBLISHER, WALLET_EVENTS_CLIENT } from '@/infrastructure/di.tokens';
import { WALLETS_ERROR_STATUS } from '@/infrastructure/http/error-status';
import { PrismaModule } from '@/infrastructure/persistence/prisma/prisma.module';
import { PrismaWalletRepository } from '@/infrastructure/persistence/prisma/wallet.repository.impl';
import { PrismaInboxRepository } from '@/infrastructure/persistence/prisma/inbox.repository.impl';
import { PrismaUnitOfWork } from '@/infrastructure/persistence/prisma/prisma-unit-of-work';
import { OutboxWriter } from '@/infrastructure/messaging/outbox-writer';
import { RabbitMQEventPublisher } from '@/infrastructure/messaging/rabbitmq/event-publisher.impl';
import { OutboxProcessor } from '@/infrastructure/messaging/rabbitmq/outbox-processor';
import { DlqSetupService } from '@/infrastructure/messaging/rabbitmq/dlq-setup.service';
import { GamesEventsController } from '@/infrastructure/messaging/rabbitmq/games-events.controller';
import { BetPlacedEventHandler } from '@/infrastructure/messaging/rabbitmq/handlers/bet-placed.handler';
import { PlayerCashedOutEventHandler } from '@/infrastructure/messaging/rabbitmq/handlers/player-cashed-out.handler';
import { IdempotentInbox } from '@/infrastructure/messaging/inbox/idempotent-inbox';
import { InboxProcessor } from '@/infrastructure/messaging/inbox/inbox-processor';
import { WalletsController } from '@/presentation/controllers/wallets.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ObservabilityModule,
    PrismaModule,
    ClientsModule.register([
      {
        name: WALLET_EVENTS_CLIENT,
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
    // HTTP cross-cutting concerns
    { provide: APP_FILTER, useValue: new AllExceptionsFilter(WALLETS_ERROR_STATUS) },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },

    // Ports → adapters
    { provide: WALLET_REPOSITORY, useClass: PrismaWalletRepository },
    { provide: INBOX_REPOSITORY, useClass: PrismaInboxRepository },
    { provide: UNIT_OF_WORK, useClass: PrismaUnitOfWork },

    // Messaging
    { provide: RABBITMQ_PUBLISHER, useClass: RabbitMQEventPublisher },
    OutboxWriter,
    OutboxProcessor,
    DlqSetupService,
    IdempotentInbox,
    InboxProcessor,
    BetPlacedEventHandler,
    PlayerCashedOutEventHandler,

    // Use cases
    CreateWalletUseCase,
    GetWalletUseCase,
    CreditWalletUseCase,
    DebitBetStakeUseCase,
  ],
})
export class AppModule {}
