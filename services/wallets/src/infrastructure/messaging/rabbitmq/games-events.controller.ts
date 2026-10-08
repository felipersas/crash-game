import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload, Ctx, type RmqContext } from '@nestjs/microservices';
import { Prisma } from '@prisma/client';
import type { Channel, ConsumeMessage } from 'amqplib';
import { OptimisticLockError } from '@/domain/errors/domain.errors';
import { BetPlacedEventHandler } from './handlers/bet-placed.handler';
import { PlayerCashedOutEventHandler } from './handlers/player-cashed-out.handler';
import type {
  BetPlacedMessage,
  PlayerCashedOutMessage,
} from '@/infrastructure/messaging/types/games.events';

const QUEUE_NAME = 'wallets.games.events';
const MAX_RETRIES = 3;
const RETRY_HEADER = 'x-retry-count';

/** Game events published on the fanout exchange that Wallets does not act on. */
const IGNORED_EVENTS = [
  'RoundStarted',
  'BettingPhaseEnded',
  'RoundCrashed',
  'BetConfirmed',
  'BetCancelled',
] as const;

/**
 * Consumes Games events from the `wallets.games.events` queue.
 * Transient failures are re-queued up to MAX_RETRIES; everything else goes to
 * the dead-letter queue (wallets.games.events.dlq).
 */
@Controller()
export class GamesEventsController {
  private readonly logger = new Logger(GamesEventsController.name);

  constructor(
    private readonly betPlacedHandler: BetPlacedEventHandler,
    private readonly playerCashedOutHandler: PlayerCashedOutEventHandler,
  ) {}

  @EventPattern('BetPlaced')
  async handleBetPlaced(
    @Payload() event: BetPlacedMessage,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    await this.processWithRetry(context, event.eventType, () =>
      this.betPlacedHandler.handle(event),
    );
  }

  @EventPattern('PlayerCashedOut')
  async handlePlayerCashedOut(
    @Payload() event: PlayerCashedOutMessage,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    await this.processWithRetry(context, event.eventType, () =>
      this.playerCashedOutHandler.handle(event),
    );
  }

  @EventPattern(IGNORED_EVENTS)
  ignore(@Ctx() context: RmqContext): void {
    (context.getChannelRef() as Channel).ack(context.getMessage() as ConsumeMessage);
  }

  private async processWithRetry(
    context: RmqContext,
    eventType: string,
    handle: () => Promise<void>,
  ): Promise<void> {
    const channel = context.getChannelRef() as Channel;
    const message = context.getMessage() as ConsumeMessage;
    const retryCount = Number(message.properties.headers?.[RETRY_HEADER] ?? 0);

    try {
      await handle();
      channel.ack(message);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);

      if (isTransientError(error) && retryCount < MAX_RETRIES) {
        this.logger.warn(`${eventType} failed (${reason}), retry ${retryCount + 1}/${MAX_RETRIES}`);
        channel.sendToQueue(QUEUE_NAME, message.content, {
          headers: { [RETRY_HEADER]: retryCount + 1 },
        });
        channel.ack(message);
      } else {
        this.logger.error(`${eventType} failed permanently, sending to DLQ: ${reason}`);
        channel.nack(message, false, false);
      }
    }
  }
}

/**
 * Failures that may succeed if the message is processed again:
 * concurrent wallet updates, serialization conflicts and lost DB connectivity.
 */
function isTransientError(error: unknown): boolean {
  return (
    error instanceof OptimisticLockError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P1001', 'P1002', 'P1008', 'P1017', 'P2034'].includes(error.code))
  );
}
