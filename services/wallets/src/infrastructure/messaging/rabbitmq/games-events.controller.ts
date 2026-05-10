/**
 * Games Events Controller - Infrastructure Layer
 *
 * Consumes domain events from the Games service via NestJS Microservices.
 * Replaces the raw amqp-connection-manager consumer with declarative
 * @EventPattern handlers while preserving retry/DLQ logic.
 */

import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { BetPlacedEventHandler } from './handlers/bet-placed.handler';
import { PlayerCashedOutEventHandler } from './handlers/player-cashed-out.handler';
import { OptimisticLockError } from '@/domain/errors/domain.errors';
import type { ConsumeMessage } from 'amqplib';

@Controller()
export class GamesEventsController {
  private readonly logger = new Logger(GamesEventsController.name);
  private readonly MAX_RETRIES = 3;
  private readonly QUEUE_NAME = 'wallets.games.events';

  constructor(
    private readonly betPlacedHandler: BetPlacedEventHandler,
    private readonly playerCashedOutHandler: PlayerCashedOutEventHandler,
  ) {}

  @EventPattern('BetPlaced')
  async handleBetPlaced(
    @Payload() event: any,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    await this.processWithRetry(event, context, this.betPlacedHandler);
  }

  @EventPattern('PlayerCashedOut')
  async handlePlayerCashedOut(
    @Payload() event: any,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    await this.processWithRetry(event, context, this.playerCashedOutHandler);
  }

  // Ack-only handlers for game events not relevant to wallets
  @EventPattern('RoundStarted')
  async handleRoundStarted(@Ctx() context: RmqContext): Promise<void> {
    context.getChannelRef().ack(context.getMessage());
  }

  @EventPattern('BettingPhaseEnded')
  async handleBettingPhaseEnded(@Ctx() context: RmqContext): Promise<void> {
    context.getChannelRef().ack(context.getMessage());
  }

  @EventPattern('RoundCrashed')
  async handleRoundCrashed(@Ctx() context: RmqContext): Promise<void> {
    context.getChannelRef().ack(context.getMessage());
  }

  @EventPattern('BetConfirmed')
  async handleBetConfirmed(@Ctx() context: RmqContext): Promise<void> {
    context.getChannelRef().ack(context.getMessage());
  }

  @EventPattern('BetCancelled')
  async handleBetCancelled(@Ctx() context: RmqContext): Promise<void> {
    context.getChannelRef().ack(context.getMessage());
  }

  private async processWithRetry(
    event: any,
    context: RmqContext,
    handler: { handle: (e: any) => Promise<void> },
  ): Promise<void> {
    const channel = context.getChannelRef();
    const msg = context.getMessage() as ConsumeMessage;
    const retryCount = (msg.properties?.headers?.['x-retry-count'] as number) ?? 0;

    try {
      this.logger.debug(`Received event: ${event.eventType} (retry: ${retryCount}/${this.MAX_RETRIES})`);
      await handler.handle(event);
      channel.ack(msg);
      this.logger.debug(`Event ${event.eventType} processed successfully`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error processing event (retry ${retryCount}/${this.MAX_RETRIES}): ${errorMessage}`,
      );

      if (this.isTransientError(error) && retryCount < this.MAX_RETRIES) {
        const newRetryCount = retryCount + 1;
        this.logger.warn(`Retrying immediately (attempt ${newRetryCount}/${this.MAX_RETRIES})`);

        channel.sendToQueue(this.QUEUE_NAME, msg.content, {
          headers: { 'x-retry-count': newRetryCount },
        });
        channel.ack(msg);
      } else {
        this.logger.error(`Sending to DLQ: ${errorMessage}`);
        channel.nack(msg, false, false);
      }
    }
  }

  private isTransientError(error: unknown): boolean {
    if (error instanceof OptimisticLockError) return true;

    if (error instanceof Error) {
      if (error.message.includes('transaction') || error.message.includes('lock')) return true;
      if (
        error.message.includes('timeout') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('ECONNREFUSED')
      ) return true;
    }

    return false;
  }
}
