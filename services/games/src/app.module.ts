import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { GamesController } from './presentation/controllers/games.controller';
import { PrismaModule } from './infrastructure/persistence/prisma/prisma.module';
import { PrismaService } from './infrastructure/persistence/prisma/prisma.service';
import { PrismaRoundRepository } from './infrastructure/persistence/prisma/round.repository.impl';
import { RabbitMQEventPublisher } from './infrastructure/messaging/rabbitmq/event-publisher.impl';
import { OutboxProcessor } from './infrastructure/messaging/rabbitmq/outbox-processor';
import { GamesGateway } from './infrastructure/websocket/games.gateway';
import { PlaceBetUseCase } from './application/use-cases/place-bet.use-case';
import { CashOutUseCase } from './application/use-cases/cash-out.use-case';
import { GetCurrentRoundUseCase } from './application/use-cases/get-current-round.use-case';
import { GetRoundHistoryUseCase } from './application/use-cases/get-round-history.use-case';
import { VerifyRoundUseCase } from './application/use-cases/verify-round.use-case';
import { ROUND_REPOSITORY, EVENT_PUBLISHER } from './infrastructure/di/tokens';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
  ],
  controllers: [GamesController],
  providers: [
    // Infrastructure
    PrismaService,
    {
      provide: ROUND_REPOSITORY,
      useClass: PrismaRoundRepository,
    },
    {
      provide: EVENT_PUBLISHER,
      useClass: RabbitMQEventPublisher,
    },
    RabbitMQEventPublisher,
    OutboxProcessor,
    GamesGateway,
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
    GamesGateway,
  ],
})
export class AppModule {}
