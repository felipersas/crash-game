/**
 * Inbox Repository Implementation - Infrastructure Layer
 *
 * Prisma-based implementation of IInboxRepository.
 * Provides idempotency by tracking processed events via unique idempotency key.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import type {
  IInboxRepository,
  InboxEvent,
  InboxEventCreateInput,
} from '@/application/interfaces/inbox.repository';

@Injectable()
export class PrismaInboxRepository implements IInboxRepository {
  private readonly logger = new Logger(PrismaInboxRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async tryCreate(input: InboxEventCreateInput): Promise<InboxEvent | null> {
    try {
      const event = await this.prisma.inboxEvent.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          eventType: input.eventType,
          payload: input.payload as Prisma.InputJsonValue,
          status: 'PENDING',
        },
      });

      return this.toDomain(event);
    } catch (error: unknown) {
      // Unique constraint violation means event already exists
      if (error instanceof Error && 'code' in error && error.code === 'P2002') {
        this.logger.debug(`Duplicate inbox event: ${input.idempotencyKey}`);
        return null;
      }
      throw error;
    }
  }

  async markAsProcessed(id: string, processedAt: Date): Promise<void> {
    await this.prisma.inboxEvent.update({
      where: { id },
      data: {
        status: 'PROCESSED',
        processedAt,
      },
    });
  }

  async markAsFailed(id: string, errorMessage: string, retryCount: number): Promise<void> {
    await this.prisma.inboxEvent.update({
      where: { id },
      data: {
        status: 'FAILED',
        errorMessage,
        retryCount,
      },
    });
  }

  async incrementRetry(id: string): Promise<void> {
    await this.prisma.inboxEvent.update({
      where: { id },
      data: {
        retryCount: { increment: 1 },
      },
    });
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<InboxEvent | null> {
    const event = await this.prisma.inboxEvent.findUnique({
      where: { idempotencyKey },
    });

    if (!event) {
      return null;
    }

    return this.toDomain(event);
  }

  async findById(id: string): Promise<InboxEvent | null> {
    const event = await this.prisma.inboxEvent.findUnique({
      where: { id },
    });

    if (!event) {
      return null;
    }

    return this.toDomain(event);
  }

  async deleteOlderThan(days: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await this.prisma.inboxEvent.deleteMany({
      where: {
        status: 'PROCESSED',
        processedAt: { lt: cutoffDate },
      },
    });

    return result.count;
  }

  async findFailed(maxRetries: number): Promise<InboxEvent[]> {
    const records = await this.prisma.inboxEvent.findMany({
      where: {
        status: 'FAILED',
        retryCount: { lt: maxRetries },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    return records.map((r) => this.toDomain(r));
  }

  private toDomain(record: {
    id: string;
    idempotencyKey: string;
    eventType: string;
    payload: Prisma.JsonValue;
    status: string;
    processedAt: Date | null;
    errorMessage: string | null;
    retryCount: number | null;
    createdAt: Date;
  }): InboxEvent {
    return {
      id: record.id,
      idempotencyKey: record.idempotencyKey,
      eventType: record.eventType,
      payload: record.payload as Record<string, unknown>,
      status: record.status as InboxEvent['status'],
      processedAt: record.processedAt,
      errorMessage: record.errorMessage,
      retryCount: record.retryCount ?? 0,
      createdAt: record.createdAt,
    };
  }
}
