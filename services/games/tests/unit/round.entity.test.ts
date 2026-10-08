/**
 * Unit tests for Round Entity (Aggregate Root).
 *
 * Tests cover:
 * - Round creation and restoration
 * - Round lifecycle (BETTING → ACTIVE → CRASHED)
 * - Bet placement / replacement
 * - Cash out
 * - Crash logic
 * - Domain events (including bet events drained through the root)
 * - Persistence
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  Round,
  RoundStatus,
  DEFAULT_ROUND_CONFIG,
  type RoundSnapshot,
} from '../../src/domain/entities/round.entity';
import { Bet, BetStatus } from '../../src/domain/entities/bet.entity';
import { Multiplier } from '../../src/domain/value-objects/multiplier.value-object';
import { Money, PlayerId, RoundId, BetId } from '@crash/domain';
import {
  RoundNotAcceptingBetsError,
  DuplicateBetError,
  NoActiveBetError,
  RoundAlreadyCrashedError,
  BetBelowMinimumError,
  BetAboveMaximumError,
  InvalidRoundStateError,
  InvalidAutoCashOutMultiplierError,
  SeedNotAvailableError,
} from '../../src/domain/errors/domain.errors';

const SEED = 'ab'.repeat(32);
const SEED_HASH = 'cd'.repeat(32);
const ROUND_ID = RoundId.from('round-1');
const P1 = PlayerId.from('player-1');
const P2 = PlayerId.from('player-2');

/** Seconds of growth (default rate) needed to reach the given multiplier. */
const secondsFor = (multiplier: number) => Math.log(multiplier) / DEFAULT_ROUND_CONFIG.growthRate;

function roundSnapshot(overrides: Partial<RoundSnapshot> = {}): RoundSnapshot {
  return {
    id: ROUND_ID,
    seed: SEED,
    seedHash: SEED_HASH,
    status: RoundStatus.ACTIVE,
    crashPoint: 10,
    bettingEndTime: new Date('2026-01-01T00:00:10Z'),
    startedAt: new Date('2026-01-01T00:00:10Z'),
    crashedAt: null,
    version: 2,
    ...overrides,
  };
}

function restoredBet(
  playerId: PlayerId,
  status: BetStatus,
  amountCents = 1000n,
  roundId: RoundId = ROUND_ID,
): Bet {
  return Bet.restore({
    id: BetId.from(`bet-${playerId}`),
    roundId,
    playerId,
    playerName: `Name ${playerId}`,
    amountCents,
    status,
    autoCashOutMultiplier: null,
    cashOutMultiplier: null,
    cashOutAmount: null,
    cashedOutAt: null,
    cancelReason: status === BetStatus.CANCELLED ? 'test' : null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  });
}

/** Round in ACTIVE phase with the given bets confirmed, events cleared. */
async function activeRoundWithConfirmedBets(
  bets: Array<[PlayerId, string]> = [[P1, '10.00']],
): Promise<Round> {
  const round = await Round.create();
  for (const [playerId, amount] of bets) {
    round.placeBet(playerId, `Name ${playerId}`, Money.fromDecimal(amount)).confirm();
  }
  await round.startRound();
  round.pullEvents();
  return round;
}

describe('Round Entity', () => {
  let round: Round;

  beforeEach(async () => {
    round = await Round.create();
  });

  describe('Creation', () => {
    test('should create round with BETTING status', () => {
      expect(round.id).toBeDefined();
      expect(round.getStatus()).toBe(RoundStatus.BETTING);
      expect(round.getCrashPoint()).toBeNull();
      expect(round.getBettingEndTime()).toBeInstanceOf(Date);
      expect(round.getStartedAt()).toBeNull();
      expect(round.getCrashedAt()).toBeNull();
      expect(round.getVersion()).toBe(1);
    });

    test('should generate unique round IDs', async () => {
      const other = await Round.create();

      expect(round.id).not.toBe(other.id);
    });

    test('should set betting end time from config duration', async () => {
      const before = Date.now();
      const custom = await Round.create({ ...DEFAULT_ROUND_CONFIG, bettingDurationMs: 5000 });

      const endTime = custom.getBettingEndTime()!.getTime();
      expect(endTime).toBeGreaterThanOrEqual(before + 5000);
      expect(endTime).toBeLessThanOrEqual(Date.now() + 5000);
    });

    test('should emit RoundStarted event with the seed hash commitment', () => {
      const events = round.pullEvents();

      expect(events).toHaveLength(1);
      const event = events[0];
      if (event.eventType !== 'RoundStarted') throw new Error('Expected RoundStarted event');
      expect(event.roundId).toBe(round.id);
      expect(event.seedHash).toBe(round.getSeedHash());
      expect(event.seedHash).toHaveLength(64);
      expect(event.bettingEndTime).toEqual(round.getBettingEndTime()!);
    });

    test('should start with multiplier at 1.00x', () => {
      expect(round.getCurrentMultiplier()).toBe(1.0);
    });

    test('should produce the same seed hash for the same deterministic seed', async () => {
      const a = await Round.create(DEFAULT_ROUND_CONFIG, 'fixed-seed');
      const b = await Round.create(DEFAULT_ROUND_CONFIG, 'fixed-seed');

      expect(a.getSeedHash()).toBe(b.getSeedHash());
    });
  });

  describe('Restore', () => {
    test('should restore state from snapshot without raising events', () => {
      const snapshot = roundSnapshot();

      const restored = Round.restore(snapshot, []);

      expect(restored.id).toBe(ROUND_ID);
      expect(restored.getStatus()).toBe(RoundStatus.ACTIVE);
      expect(restored.getCrashPoint()).toBe(10);
      expect(restored.getSeedHash()).toBe(SEED_HASH);
      expect(restored.getBettingEndTime()).toEqual(snapshot.bettingEndTime!);
      expect(restored.getStartedAt()).toEqual(snapshot.startedAt!);
      expect(restored.getCrashedAt()).toBeNull();
      expect(restored.getVersion()).toBe(2);
      expect(restored.pullEvents()).toHaveLength(0);
    });

    test('should restore a BETTING round without crash point', () => {
      const restored = Round.restore(
        roundSnapshot({ status: RoundStatus.BETTING, crashPoint: null, startedAt: null }),
        [],
      );

      expect(restored.getStatus()).toBe(RoundStatus.BETTING);
      expect(restored.getCrashPoint()).toBeNull();
    });

    test('should attach live bets and skip CANCELLED ones', () => {
      const restored = Round.restore(roundSnapshot(), [
        restoredBet(P1, BetStatus.ACTIVE),
        restoredBet(P2, BetStatus.CANCELLED),
      ]);

      expect(restored.getBets()).toHaveLength(1);
      expect(restored.getBetByPlayer(P1)?.isActive()).toBe(true);
      expect(restored.getBetByPlayer(P2)).toBeUndefined();
    });

    test('should expose the seed of a restored CRASHED round', () => {
      const restored = Round.restore(
        roundSnapshot({ status: RoundStatus.CRASHED, crashPoint: 2.5, crashedAt: new Date() }),
        [],
      );

      expect(restored.getSeed()).toBe(SEED);
    });

    test('should round-trip through toPersistence', async () => {
      round.placeBet(P1, 'Player One', Money.fromDecimal('10.00'));
      await round.startRound();

      const restored = Round.restore(round.toPersistence(), round.getBets());

      expect(restored.id).toBe(round.id);
      expect(restored.getStatus()).toBe(round.getStatus());
      expect(restored.getCrashPoint()).toBe(round.getCrashPoint());
      expect(restored.getSeedHash()).toBe(round.getSeedHash());
      expect(restored.getVersion()).toBe(round.getVersion());
      expect(restored.getBets()).toHaveLength(1);
    });

    test('should apply the given config', () => {
      const restored = Round.restore(
        roundSnapshot({ status: RoundStatus.BETTING, crashPoint: null }),
        [],
        { ...DEFAULT_ROUND_CONFIG, minBetAmount: Money.fromDecimal('5.00') },
      );

      expect(() => restored.placeBet(P1, 'Player One', Money.fromDecimal('4.99'))).toThrow(
        BetBelowMinimumError,
      );
    });
  });

  describe('Bet Placement', () => {
    test('should place PENDING bet during BETTING phase and return it', () => {
      const bet = round.placeBet(P1, 'Player One', Money.fromDecimal('10.00'));

      expect(bet).toBeInstanceOf(Bet);
      expect(bet.roundId).toBe(round.id);
      expect(bet.playerId).toBe(P1);
      expect(bet.playerName).toBe('Player One');
      expect(bet.getAmount().toCents()).toBe(1000n);
      expect(bet.getStatus()).toBe(BetStatus.PENDING);
      expect(round.getBetByPlayer(P1)).toBe(bet);
    });

    test('should emit BetPlaced event', () => {
      round.pullEvents();

      const bet = round.placeBet(P1, 'Player One', Money.fromDecimal('10.00'));

      const events = round.pullEvents();
      expect(events).toHaveLength(1);
      const event = events[0];
      if (event.eventType !== 'BetPlaced') throw new Error('Expected BetPlaced event');
      expect(event.aggregateId).toBe(round.id);
      expect(event.betId).toBe(bet.id);
      expect(event.playerId).toBe(P1);
      expect(event.amount).toBe(1000n);
    });

    test('should reject bet when not in BETTING phase', async () => {
      await round.startRound();

      expect(() => round.placeBet(P1, 'Player One', Money.fromDecimal('10.00'))).toThrow(
        RoundNotAcceptingBetsError,
      );
    });

    test('should reject duplicate bet from same player', () => {
      round.placeBet(P1, 'Player One', Money.fromDecimal('10.00'));

      expect(() => round.placeBet(P1, 'Player One', Money.fromDecimal('10.00'))).toThrow(
        DuplicateBetError,
      );
    });

    test('should reject bet below minimum', () => {
      expect(() => round.placeBet(P1, 'Player One', Money.fromDecimal('0.50'))).toThrow(
        BetBelowMinimumError,
      );
    });

    test('should reject bet above maximum', () => {
      expect(() => round.placeBet(P1, 'Player One', Money.fromDecimal('2000.00'))).toThrow(
        BetAboveMaximumError,
      );
    });

    test('should accept minimum and maximum bet amounts', () => {
      expect(() => round.placeBet(P1, 'Player One', Money.fromDecimal('1.00'))).not.toThrow();
      expect(() => round.placeBet(P2, 'Player Two', Money.fromDecimal('1000.00'))).not.toThrow();
    });

    test('should report the configured limits in error messages', async () => {
      const custom = await Round.create({
        ...DEFAULT_ROUND_CONFIG,
        minBetAmount: Money.fromDecimal('5.00'),
        maxBetAmount: Money.fromDecimal('500.00'),
      });

      expect(() => custom.placeBet(P1, 'Player One', Money.fromDecimal('4.99'))).toThrow(
        'Bet amount $4.99 is below minimum of $5.00',
      );
      expect(() => custom.placeBet(P1, 'Player One', Money.fromDecimal('500.01'))).toThrow(
        'Bet amount $500.01 exceeds maximum of $500.00',
      );
    });

    test('should NOT increment version when bet is placed (bet is separate entity)', () => {
      const initialVersion = round.getVersion();

      round.placeBet(P1, 'Player One', Money.fromDecimal('10.00'));

      expect(round.getVersion()).toBe(initialVersion);
    });
  });

  describe('placeOrReplaceBet', () => {
    const amount = Money.fromDecimal('10.00');

    test('should place bet when no existing bet', () => {
      const { bet, replacedBet } = round.placeOrReplaceBet(P1, 'Player One', amount);

      expect(bet.playerId).toBe(P1);
      expect(bet.getAmount().toCents()).toBe(1000n);
      expect(replacedBet).toBeNull();
      expect(round.getBetByPlayer(P1)).toBe(bet);
    });

    test('should replace PENDING bet, cancel it and return it', () => {
      const original = round.placeBet(P1, 'Player One', Money.fromDecimal('5.00'));

      const { bet, replacedBet } = round.placeOrReplaceBet(P1, 'Player One', amount);

      expect(replacedBet).toBe(original);
      expect(replacedBet!.getStatus()).toBe(BetStatus.CANCELLED);
      expect(replacedBet!.getCancelReason()).toBe('Replaced by new bet attempt');
      expect(bet.id).not.toBe(original.id);
      expect(round.getBetByPlayer(P1)).toBe(bet);
      expect(round.getBets()).toHaveLength(1);
    });

    test('should emit the replaced bet BetCancelled before the new BetPlaced', () => {
      const original = round.placeBet(P1, 'Player One', Money.fromDecimal('5.00'));
      round.pullEvents();

      const { bet } = round.placeOrReplaceBet(P1, 'Player One', amount);

      const events = round.pullEvents();
      expect(events.map((e) => e.eventType)).toEqual(['BetCancelled', 'BetPlaced']);
      const [cancelled, placed] = events;
      if (cancelled.eventType !== 'BetCancelled') throw new Error('Expected BetCancelled');
      if (placed.eventType !== 'BetPlaced') throw new Error('Expected BetPlaced');
      expect(cancelled.betId).toBe(original.id);
      expect(placed.betId).toBe(bet.id);
      expect(round.pullEvents()).toHaveLength(0);
    });

    test('should replace CANCELLED bet without returning it', () => {
      round.placeBet(P1, 'Player One', Money.fromDecimal('5.00')).cancel('Insufficient funds');

      const { bet, replacedBet } = round.placeOrReplaceBet(P1, 'Player One', amount);

      expect(bet.getAmount().toCents()).toBe(1000n);
      expect(replacedBet).toBeNull();
      expect(round.getBetByPlayer(P1)).toBe(bet);
    });

    test('should reject when existing bet is ACTIVE', () => {
      round.placeBet(P1, 'Player One', amount).confirm();

      expect(() => round.placeOrReplaceBet(P1, 'Player One', amount)).toThrow(DuplicateBetError);
      expect(round.getBetByPlayer(P1)?.isActive()).toBe(true);
    });

    test('should reject when not in BETTING phase', async () => {
      await round.startRound();

      expect(() => round.placeOrReplaceBet(P1, 'Player One', amount)).toThrow(
        RoundNotAcceptingBetsError,
      );
    });

    describe('regression: invalid input leaves the existing PENDING bet untouched', () => {
      let original: Bet;

      beforeEach(() => {
        original = round.placeBet(P1, 'Player One', Money.fromDecimal('5.00'));
        round.pullEvents();
      });

      function expectOriginalUntouched() {
        expect(original.isPending()).toBe(true);
        expect(original.getCancelReason()).toBeNull();
        expect(round.getBetByPlayer(P1)).toBe(original);
        expect(round.pullEvents()).toHaveLength(0);
      }

      test('amount below minimum', () => {
        expect(() => round.placeOrReplaceBet(P1, 'Player One', Money.fromDecimal('0.50'))).toThrow(
          BetBelowMinimumError,
        );
        expectOriginalUntouched();
      });

      test('amount above maximum', () => {
        expect(() =>
          round.placeOrReplaceBet(P1, 'Player One', Money.fromDecimal('2000.00')),
        ).toThrow(BetAboveMaximumError);
        expectOriginalUntouched();
      });

      test('invalid auto cash-out multiplier', () => {
        expect(() => round.placeOrReplaceBet(P1, 'Player One', amount, 1.0)).toThrow(
          InvalidAutoCashOutMultiplierError,
        );
        expectOriginalUntouched();
      });
    });

    test('should NOT increment version', () => {
      const v0 = round.getVersion();

      round.placeOrReplaceBet(P1, 'Player One', amount);
      round.placeOrReplaceBet(P1, 'Player One', Money.fromDecimal('20.00'));

      expect(round.getVersion()).toBe(v0);
    });
  });

  describe('Round Start', () => {
    test('should transition to ACTIVE, set startedAt and compute crash point', async () => {
      await round.startRound();

      expect(round.getStatus()).toBe(RoundStatus.ACTIVE);
      expect(round.getStartedAt()).toBeInstanceOf(Date);
      expect(round.getCrashPoint()).toBeGreaterThanOrEqual(1.0);
    });

    test('should derive the same crash point for the same deterministic seed', async () => {
      const a = await Round.create(DEFAULT_ROUND_CONFIG, 'fixed-seed');
      const b = await Round.create(DEFAULT_ROUND_CONFIG, 'fixed-seed');

      await a.startRound();
      await b.startRound();

      expect(a.getCrashPoint()).toBe(b.getCrashPoint());
    });

    test('should emit BettingPhaseEnded event', async () => {
      round.pullEvents();

      await round.startRound();

      const events = round.pullEvents();
      expect(events.map((e) => e.eventType)).toEqual(['BettingPhaseEnded']);
      expect(events[0].version).toBe(round.getVersion());
    });

    test('should reject starting an ACTIVE round', async () => {
      await round.startRound();

      await expect(round.startRound()).rejects.toThrow(InvalidRoundStateError);
    });

    test('should increment version', async () => {
      const initialVersion = round.getVersion();

      await round.startRound();

      expect(round.getVersion()).toBe(initialVersion + 1);
    });
  });

  describe('Cash Out', () => {
    let active: Round;

    beforeEach(async () => {
      active = await activeRoundWithConfirmedBets();
    });

    test('should cash out active bet at the current multiplier', () => {
      const restored = Round.restore(roundSnapshot({ crashPoint: 10 }), [
        restoredBet(P1, BetStatus.ACTIVE),
      ]);
      restored.updateMultiplier(secondsFor(2.5));
      const current = restored.getCurrentMultiplier();

      const payout = restored.cashOut(P1);

      const bet = restored.getBetByPlayer(P1)!;
      expect(bet.isCashedOut()).toBe(true);
      expect(bet.getCashOutMultiplier()?.getValue()).toBe(current);
      expect(payout.toCents()).toBe(Multiplier.fromValue(current).calculatePayout(1000n));
    });

    test('should cash out at the override multiplier', () => {
      const payout = active.cashOut(P1, Multiplier.fromValue(2.0));

      expect(payout.toCents()).toBe(2000n);
      expect(active.getBetByPlayer(P1)?.getCashOutMultiplier()?.getValue()).toBe(2.0);
    });

    test('should emit PlayerCashedOut event', () => {
      active.cashOut(P1, Multiplier.fromValue(2.0));

      const events = active.pullEvents();
      expect(events).toHaveLength(1);
      const event = events[0];
      if (event.eventType !== 'PlayerCashedOut') throw new Error('Expected PlayerCashedOut');
      expect(event.playerId).toBe(P1);
      expect(event.betAmount).toBe(1000n);
      expect(event.cashOutMultiplier).toBe(2.0);
      expect(event.winAmount).toBe(2000n);
    });

    test('should throw InvalidRoundStateError while BETTING', () => {
      round.placeBet(P1, 'Player One', Money.fromDecimal('10.00')).confirm();

      expect(() => round.cashOut(P1)).toThrow(InvalidRoundStateError);
    });

    test('should throw RoundAlreadyCrashedError after the crash', () => {
      active.crash();

      expect(() => active.cashOut(P1)).toThrow(RoundAlreadyCrashedError);
    });

    test('should reject cash out for non-existent bet', () => {
      expect(() => active.cashOut(PlayerId.from('nobody'))).toThrow(NoActiveBetError);
    });

    test('should reject cash out for a PENDING bet', async () => {
      const r = await Round.create();
      r.placeBet(P1, 'Player One', Money.fromDecimal('10.00'));
      await r.startRound();

      expect(() => r.cashOut(P1)).toThrow(NoActiveBetError);
    });

    test('should reject duplicate cash out', () => {
      active.cashOut(P1, Multiplier.fromValue(2.0));

      expect(() => active.cashOut(P1)).toThrow(NoActiveBetError);
    });

    test('should NOT increment version', () => {
      const initialVersion = active.getVersion();

      active.cashOut(P1, Multiplier.fromValue(2.0));

      expect(active.getVersion()).toBe(initialVersion);
    });
  });

  describe('Multiplier Update', () => {
    test('should update multiplier based on elapsed time', async () => {
      await round.startRound();

      round.updateMultiplier(1);

      expect(round.getCurrentMultiplier()).toBeCloseTo(Math.exp(0.06), 10);
    });

    test('should not update multiplier when not ACTIVE', () => {
      round.updateMultiplier(10);

      expect(round.getCurrentMultiplier()).toBe(1.0);
    });

    test('should not crash below the crash point', () => {
      const restored = Round.restore(roundSnapshot({ crashPoint: 2.0 }), []);

      restored.updateMultiplier(secondsFor(1.9));

      expect(restored.getStatus()).toBe(RoundStatus.ACTIVE);
    });

    test('should crash when the multiplier reaches the crash point', () => {
      const restored = Round.restore(roundSnapshot({ crashPoint: 2.0 }), []);

      restored.updateMultiplier(secondsFor(2.1));

      expect(restored.getStatus()).toBe(RoundStatus.CRASHED);
    });
  });

  describe('Crash', () => {
    let active: Round;

    beforeEach(async () => {
      active = await activeRoundWithConfirmedBets([
        [P1, '10.00'],
        [P2, '20.00'],
      ]);
    });

    test('should transition to CRASHED, set crashedAt and increment version', () => {
      const initialVersion = active.getVersion();

      active.crash();

      expect(active.getStatus()).toBe(RoundStatus.CRASHED);
      expect(active.getCrashedAt()).toBeInstanceOf(Date);
      expect(active.getVersion()).toBe(initialVersion + 1);
    });

    test('should mark active bets as lost and keep cashed out bets', () => {
      active.cashOut(P1, Multiplier.fromValue(2.0));

      active.crash();

      expect(active.getBetByPlayer(P1)?.isCashedOut()).toBe(true);
      expect(active.getBetByPlayer(P2)?.isLost()).toBe(true);
    });

    test('should cancel PENDING bets and drain their BetCancelled events', async () => {
      const r = await Round.create();
      r.placeBet(P1, 'Player One', Money.fromDecimal('10.00')).confirm();
      const pending = r.placeBet(P2, 'Player Two', Money.fromDecimal('20.00'));
      await r.startRound();
      r.pullEvents();

      r.crash();

      expect(pending.isCancelled()).toBe(true);
      expect(pending.getCancelReason()).toBe('Round crashed before wallet confirmation');
      expect(r.getBetByPlayer(P1)?.isLost()).toBe(true);
      const events = r.pullEvents();
      expect(events.map((e) => e.eventType).sort()).toEqual(['BetCancelled', 'RoundCrashed']);
    });

    test('should emit RoundCrashed with revealed seed and totals excluding cancelled bets', async () => {
      const r = await Round.create();
      r.placeBet(P1, 'Player One', Money.fromDecimal('10.00')).confirm();
      r.placeBet(P2, 'Player Two', Money.fromDecimal('20.00')).confirm();
      r.placeBet(PlayerId.from('player-3'), 'Player Three', Money.fromDecimal('50.00'));
      await r.startRound();
      r.cashOut(P1, Multiplier.fromValue(2.5));
      r.pullEvents();

      r.crash();

      const crashEvent = r.pullEvents().find((e) => e.eventType === 'RoundCrashed');
      if (!crashEvent || crashEvent.eventType !== 'RoundCrashed') {
        throw new Error('Expected RoundCrashed event');
      }
      expect(crashEvent.crashPoint).toBe(r.getCrashPoint()!);
      expect(crashEvent.seed).toBe(r.getSeed());
      expect(crashEvent.seed).toHaveLength(64);
      expect(crashEvent.totalBets).toBe(2);
      expect(crashEvent.totalBetAmount).toBe(3000n);
      // Profit of the cashed out bet: 25.00 payout - 10.00 stake
      expect(crashEvent.totalWinAmount).toBe(1500n);
      expect(crashEvent.version).toBe(r.getVersion());
    });

    test('should reject crashing a BETTING round', () => {
      expect(() => round.crash()).toThrow(InvalidRoundStateError);
    });

    test('should reject crashing an already CRASHED round', () => {
      active.crash();

      expect(() => active.crash()).toThrow(InvalidRoundStateError);
    });
  });

  describe('Seed Access', () => {
    test('should reveal seed after crash', async () => {
      await round.startRound();
      round.crash();

      expect(round.getSeed()).toHaveLength(64);
    });

    test('should reject seed access before crash', async () => {
      expect(() => round.getSeed()).toThrow(SeedNotAvailableError);
      await round.startRound();
      expect(() => round.getSeed()).toThrow('Results are not available until the round crashes');
    });

    test('should reveal a seed that hashes to the committed seed hash', async () => {
      const { SeedChain } = await import('../../src/domain/value-objects/seed-chain.value-object');
      await round.startRound();
      round.crash();

      expect(await SeedChain.verifySeed(round.getSeed(), round.getSeedHash())).toBe(true);
    });
  });

  describe('Domain Events', () => {
    test('should collect and clear events on pullEvents', () => {
      round.placeBet(P1, 'Player One', Money.fromDecimal('10.00'));

      expect(round.pullEvents().length).toBeGreaterThan(0);
      expect(round.pullEvents()).toHaveLength(0);
    });

    test('should drain events raised by bets in the round', () => {
      const bet = round.placeBet(P1, 'Player One', Money.fromDecimal('10.00'));
      round.pullEvents();

      bet.confirm();

      const events = round.pullEvents();
      expect(events.map((e) => e.eventType)).toEqual(['BetConfirmed']);
      expect(bet.pullEvents()).toHaveLength(0);
    });

    test('should list root events before bet events', () => {
      round.pullEvents();
      const bet = round.placeBet(P1, 'Player One', Money.fromDecimal('10.00'));
      bet.confirm();

      expect(round.pullEvents().map((e) => e.eventType)).toEqual(['BetPlaced', 'BetConfirmed']);
    });
  });

  describe('syncBet', () => {
    test('should add a bet unknown to the aggregate', () => {
      const restored = Round.restore(roundSnapshot(), []);
      const bet = restoredBet(P1, BetStatus.ACTIVE);

      restored.syncBet(bet);

      expect(restored.getBetByPlayer(P1)).toBe(bet);
    });

    test('should replace the in-memory copy with the persisted bet', () => {
      const restored = Round.restore(roundSnapshot(), [restoredBet(P1, BetStatus.PENDING)]);
      const persisted = restoredBet(P1, BetStatus.ACTIVE);

      restored.syncBet(persisted);

      expect(restored.getBets()).toHaveLength(1);
      expect(restored.getBetByPlayer(P1)).toBe(persisted);
      expect(restored.cashOut(P1, Multiplier.fromValue(2)).toCents()).toBe(2000n);
    });

    test('should ignore CANCELLED bets', () => {
      const restored = Round.restore(roundSnapshot(), []);

      restored.syncBet(restoredBet(P1, BetStatus.CANCELLED));

      expect(restored.getBetByPlayer(P1)).toBeUndefined();
    });
  });

  describe('Getters', () => {
    test('should return all bets and bet by player', () => {
      const bet = round.placeBet(P1, 'Player One', Money.fromDecimal('10.00'));
      round.placeBet(P2, 'Player Two', Money.fromDecimal('20.00'));

      expect(round.getBets()).toHaveLength(2);
      expect(round.getBetByPlayer(P1)).toBe(bet);
      expect(round.getBetByPlayer(PlayerId.from('nobody'))).toBeUndefined();
    });

    test('getTotalWagered should sum stakes', () => {
      round.placeBet(P1, 'Player One', Money.fromDecimal('10.00'));
      round.placeBet(P2, 'Player Two', Money.fromDecimal('20.00'));

      expect(round.getTotalWagered().toCents()).toBe(3000n);
    });

    test('getTotalWagered should exclude cancelled bets', () => {
      round.placeBet(P1, 'Player One', Money.fromDecimal('10.00'));
      round.placeBet(P2, 'Player Two', Money.fromDecimal('20.00')).cancel('Insufficient funds');

      expect(round.getTotalWagered().toCents()).toBe(1000n);
    });

    test('getTotalWagered should be zero without bets', () => {
      expect(round.getTotalWagered().toCents()).toBe(0n);
    });
  });

  describe('Persistence', () => {
    test('should convert to snapshot', async () => {
      await round.startRound();

      const data = round.toPersistence();

      expect(data.id).toBe(round.id);
      expect(data.seed).toHaveLength(64);
      expect(data.seedHash).toBe(round.getSeedHash());
      expect(data.status).toBe(RoundStatus.ACTIVE);
      expect(data.crashPoint).toBe(round.getCrashPoint());
      expect(data.bettingEndTime).toEqual(round.getBettingEndTime());
      expect(data.startedAt).toEqual(round.getStartedAt());
      expect(data.crashedAt).toBeNull();
      expect(data.version).toBe(round.getVersion());
    });
  });

  describe('Auto cash-out', () => {
    test('should place bet with autoCashOutMultiplier', () => {
      const bet = round.placeBet(P1, 'Player One', Money.fromCents(1000n), 2.5);

      expect(bet.getAutoCashOutMultiplier()).toBe(2.5);
    });

    test('should placeOrReplaceBet with autoCashOutMultiplier', () => {
      const { bet } = round.placeOrReplaceBet(P1, 'Player One', Money.fromCents(1000n), 2.5);

      expect(bet.getAutoCashOutMultiplier()).toBe(2.5);
    });
  });
});
