import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { GamesController } from './presentation/controllers/games.controller';
import { PrismaModule } from './infrastructure/persistence/prisma/prisma.module';
import { PrismaService } from './infrastructure/persistence/prisma/prisma.service';
import { PrismaRoundRepository } from './infrastructure/persistence/prisma/round.repository.impl';
import { RabbitMQEventPublisher } from './infrastructure/messaging/rabbitmq/event-publisher.impl';
import { OutboxProcessor } from './infrastructure/messaging/rabbitmq/outbox-processor';
import { RoundLifecycleManager } from './infrastructure/scheduling/round-lifecycle-manager';
import { PlaceBetUseCase } from './application/use-cases/place-bet.use-case';
import { CashOutUseCase } from './application/use-cases/cash-out.use-case';
import { GetCurrentRoundUseCase } from './application/use-cases/get-current-round.use-case';
import { GetRoundHistoryUseCase } from './application/use-cases/get-round-history.use-case';
import { VerifyRoundUseCase } from './application/use-cases/verify-round.use-case';
import { ROUND_REPOSITORY, EVENT_PUBLISHER } from './infrastructure/di/tokens';
import { RoundLifecycleModule } from './infrastructure/messaging/rabbitmq/round-lifecycle.module';
import { GamesGateway } from './infrastructure/websocket/games.gateway';
import { RoundEventListeners } from './infrastructure/websocket/round-event.listeners';
import { GAMES_GATEWAY } from './infrastructure/di/tokens';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    // RoundLifecycleModule, // TODO: Fix delayed exchange plugin
  ],
  controllers: [GamesController],
  providers: [
    // Infrastructure (PrismaService from global PrismaModule)
    PrismaService,
    {
      provide: GAMES_GATEWAY,
      useClass: GamesGateway,
    },
    GamesGateway,
    RoundEventListeners,
    {
      provide: ROUND_REPOSITORY,
      useClass: PrismaRoundRepository,
    },
    {
      provide: EVENT_PUBLISHER,
      useClass: RabbitMQEventPublisher,
    },
    RabbitMQEventPublisher,
    // OutboxProcessor, // TODO: Fix PrismaService dependency resolution
    RoundLifecycleManager,
    // Use Cases
    PlaceBetUseCase,
    CashOutUseCase,
    GetCurrentRoundUseCase,
    GetRoundHistoryUseCase,
    VerifyRoundUseCase,
  ],
  exports: [
    ROUND_REPOSITORY,
    EVENT_PUBLISHER,
  ],
})
export class AppModule {}
