/**
 * Unit tests for IdempotentInbox.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { IdempotentInbox } from '../../../src/infrastructure/messaging/inbox/idempotent-inbox';
import type { InboxEvent } from '../../../src/application/interfaces/inbox.repository';
import { createMockInboxRepository, mockFn } from '../../helpers/mocks';

function inboxEvent(status: InboxEvent['status']): InboxEvent {
  return {
    id: 'inbox-1',
    idempotencyKey: 'bet-1',
    eventType: 'BetPlaced',
    payload: {},
    status,
    processedAt: null,
    errorMessage: null,
    retryCount: 0,
    createdAt: new Date(),
  };
}

describe('IdempotentInbox', () => {
  let inboxRepository: ReturnType<typeof createMockInboxRepository>;
  let inbox: IdempotentInbox;

  beforeEach(() => {
    inboxRepository = createMockInboxRepository();
    inbox = new IdempotentInbox(inboxRepository as any);
  });

  test('runs the handler with the inbox id on first delivery and marks it processed', async () => {
    // Arrange
    inboxRepository.tryCreate.mockResolvedValue(inboxEvent('PENDING'));
    const handler = mockFn(async (_inboxEventId: string) => {});

    // Act
    await inbox.process('bet-1', 'BetPlaced', { betId: '1' }, handler);

    // Assert
    expect(handler.calls).toEqual([['inbox-1']]);
    expect(inboxRepository.tryCreate.calls).toEqual([
      [{ idempotencyKey: 'bet-1', eventType: 'BetPlaced', payload: { betId: '1' } }],
    ]);
    expect(inboxRepository.markAsProcessed.calls).toEqual([['inbox-1']]);
  });

  test.each(['PROCESSED', 'PENDING'] as const)(
    'skips a duplicate of a %s event',
    async (status) => {
      inboxRepository.findByIdempotencyKey.mockResolvedValue(inboxEvent(status));
      const handler = mockFn(async (_inboxEventId: string) => {});

      await inbox.process('bet-1', 'BetPlaced', {}, handler);

      expect(handler.callCount).toBe(0);
      expect(inboxRepository.markAsProcessed.callCount).toBe(0);
    },
  );

  test('retries a stale PENDING event (process died mid-handling)', async () => {
    const stale = { ...inboxEvent('PENDING'), createdAt: new Date(Date.now() - 120_000) };
    inboxRepository.findByIdempotencyKey.mockResolvedValue(stale);
    const handler = mockFn(async (_inboxEventId: string) => {});

    await inbox.process('bet-1', 'BetPlaced', {}, handler);

    expect(handler.calls).toEqual([['inbox-1']]);
  });

  test('retries a duplicate of a FAILED event', async () => {
    inboxRepository.findByIdempotencyKey.mockResolvedValue(inboxEvent('FAILED'));
    const handler = mockFn(async (_inboxEventId: string) => {});

    await inbox.process('bet-1', 'BetPlaced', {}, handler);

    expect(handler.calls).toEqual([['inbox-1']]);
    expect(inboxRepository.markAsProcessed.calls).toEqual([['inbox-1']]);
  });

  test('records the failure and rethrows when the handler fails', async () => {
    inboxRepository.tryCreate.mockResolvedValue(inboxEvent('PENDING'));
    const handler = mockFn(async (_inboxEventId: string) => {
      throw new Error('db down');
    });

    await expect(inbox.process('bet-1', 'BetPlaced', {}, handler)).rejects.toThrow('db down');
    expect(inboxRepository.markAsFailed.calls).toEqual([['inbox-1', 'db down']]);
    expect(inboxRepository.markAsProcessed.callCount).toBe(0);
  });
});
