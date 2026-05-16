import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../game-store';
import { RoundStatus, BetStatus, type Bet } from '@/types';
import { GAME_CONSTANTS } from '@/constants/game';

const initialState = {
  isHydrated: false,
  isConnected: false,
  connectionStatus: 'disconnected' as const,
  currentRoundId: null as string | null,
  roundStatus: RoundStatus.BETTING,
  liveMultiplier: 1.0,
  bettingEndTime: null as Date | null,
  roundStartedAt: null as Date | null,
  currentSeedHash: null as string | null,
  myActiveBet: null as Bet | null,
  currentBets: [] as Bet[],
};

const mockBet: Bet = {
  id: 'bet-1',
  roundId: 'round-1',
  playerId: 'player-1',
  playerName: 'TestPlayer',
  amountCents: 1000,
  amountDecimal: '10.00',
  status: BetStatus.ACTIVE,
  cashOutMultiplier: null,
  payoutCents: null,
  payoutDecimal: null,
  cashedOutAt: null,
  autoCashOutMultiplier: null,
};

const mockBet2: Bet = {
  id: 'bet-2',
  roundId: 'round-1',
  playerId: 'player-2',
  playerName: 'OtherPlayer',
  amountCents: 2000,
  amountDecimal: '20.00',
  status: BetStatus.ACTIVE,
  cashOutMultiplier: null,
  payoutCents: null,
  payoutDecimal: null,
  cashedOutAt: null,
  autoCashOutMultiplier: null,
};

beforeEach(() => {
  useGameStore.setState({ ...initialState });
});

describe('useGameStore', () => {
  describe('setRoundStarted', () => {
    it('sets round metadata and resets round state', () => {
      const bettingEnd = new Date(Date.now() + GAME_CONSTANTS.BETTING_DURATION_MS);
      const startedAt = new Date();

      useGameStore.getState().setRoundStarted('round-1', 'hash-abc', bettingEnd, startedAt);

      const state = useGameStore.getState();
      expect(state.currentRoundId).toBe('round-1');
      expect(state.roundStatus).toBe(RoundStatus.BETTING);
      expect(state.liveMultiplier).toBe(1.0);
      expect(state.bettingEndTime).toBe(bettingEnd);
      expect(state.roundStartedAt).toBe(startedAt);
      expect(state.currentSeedHash).toBe('hash-abc');
      expect(state.myActiveBet).toBeNull();
      expect(state.currentBets).toEqual([]);
    });

    it('defaults startedAt to null when not provided', () => {
      const bettingEnd = new Date(Date.now() + GAME_CONSTANTS.BETTING_DURATION_MS);

      useGameStore.getState().setRoundStarted('round-1', 'hash-abc', bettingEnd);

      expect(useGameStore.getState().roundStartedAt).toBeNull();
    });

    it('clears previous bets and active bet', () => {
      useGameStore.setState({ myActiveBet: mockBet, currentBets: [mockBet] });
      const bettingEnd = new Date(Date.now() + GAME_CONSTANTS.BETTING_DURATION_MS);

      useGameStore.getState().setRoundStarted('round-2', 'hash-def', bettingEnd);

      expect(useGameStore.getState().myActiveBet).toBeNull();
      expect(useGameStore.getState().currentBets).toEqual([]);
    });
  });

  describe('setMultiplier', () => {
    it('updates live multiplier', () => {
      useGameStore.getState().setMultiplier(2.47);
      expect(useGameStore.getState().liveMultiplier).toBe(2.47);
    });

    it('updates to crash-level multiplier', () => {
      useGameStore.getState().setMultiplier(15.83);
      expect(useGameStore.getState().liveMultiplier).toBe(15.83);
    });
  });

  describe('setCrash', () => {
    it('sets status to CRASHED and multiplier to crash point', () => {
      useGameStore.getState().setCrash(3.14);

      const state = useGameStore.getState();
      expect(state.roundStatus).toBe(RoundStatus.CRASHED);
      expect(state.liveMultiplier).toBe(3.14);
    });
  });

  describe('setBettingEnded', () => {
    it('sets status to ACTIVE and clears bettingEndTime', () => {
      const bettingEnd = new Date(Date.now() + 5000);
      useGameStore.setState({ bettingEndTime: bettingEnd, roundStatus: RoundStatus.BETTING });

      useGameStore.getState().setBettingEnded();

      const state = useGameStore.getState();
      expect(state.roundStatus).toBe(RoundStatus.ACTIVE);
      expect(state.bettingEndTime).toBeNull();
    });

    it('sets roundStartedAt to current date if it was null', () => {
      useGameStore.setState({ roundStartedAt: null });

      useGameStore.getState().setBettingEnded();

      expect(useGameStore.getState().roundStartedAt).toBeInstanceOf(Date);
    });

    it('preserves existing roundStartedAt', () => {
      const existingDate = new Date('2025-01-01');
      useGameStore.setState({ roundStartedAt: existingDate });

      useGameStore.getState().setBettingEnded();

      expect(useGameStore.getState().roundStartedAt).toBe(existingDate);
    });
  });

  describe('setMyActiveBet', () => {
    it('sets the active bet', () => {
      useGameStore.getState().setMyActiveBet(mockBet);
      expect(useGameStore.getState().myActiveBet).toEqual(mockBet);
    });

    it('clears the active bet with null', () => {
      useGameStore.setState({ myActiveBet: mockBet });
      useGameStore.getState().setMyActiveBet(null);
      expect(useGameStore.getState().myActiveBet).toBeNull();
    });
  });

  describe('addBet', () => {
    it('adds a bet to currentBets', () => {
      useGameStore.getState().addBet(mockBet);
      expect(useGameStore.getState().currentBets).toEqual([mockBet]);
    });

    it('adds multiple bets', () => {
      useGameStore.getState().addBet(mockBet);
      useGameStore.getState().addBet(mockBet2);
      expect(useGameStore.getState().currentBets).toEqual([mockBet, mockBet2]);
    });

    it('ignores duplicate bets by id', () => {
      useGameStore.getState().addBet(mockBet);
      useGameStore.getState().addBet(mockBet);
      expect(useGameStore.getState().currentBets).toEqual([mockBet]);
    });
  });

  describe('updateBet', () => {
    it('updates specific fields of a bet', () => {
      useGameStore.setState({ currentBets: [mockBet] });

      useGameStore.getState().updateBet('bet-1', { status: BetStatus.CASHED_OUT, cashOutMultiplier: 2.5 });

      const bet = useGameStore.getState().currentBets[0];
      expect(bet.status).toBe(BetStatus.CASHED_OUT);
      expect(bet.cashOutMultiplier).toBe(2.5);
      expect(bet.amountCents).toBe(1000); // unchanged
    });

    it('does not modify other bets', () => {
      useGameStore.setState({ currentBets: [mockBet, mockBet2] });

      useGameStore.getState().updateBet('bet-1', { status: BetStatus.LOST });

      const bets = useGameStore.getState().currentBets;
      expect(bets[0].status).toBe(BetStatus.LOST);
      expect(bets[1].status).toBe(BetStatus.ACTIVE);
    });

    it('is a no-op for non-existent bet id', () => {
      useGameStore.setState({ currentBets: [mockBet] });

      useGameStore.getState().updateBet('non-existent', { status: BetStatus.LOST });

      expect(useGameStore.getState().currentBets).toEqual([mockBet]);
    });
  });

  describe('updateBetStatus', () => {
    it('updates myActiveBet status when id matches', () => {
      useGameStore.setState({ myActiveBet: mockBet });

      useGameStore.getState().updateBetStatus('bet-1', BetStatus.CASHED_OUT);

      expect(useGameStore.getState().myActiveBet!.status).toBe(BetStatus.CASHED_OUT);
    });

    it('updates myActiveBet with cashOutData', () => {
      useGameStore.setState({ myActiveBet: mockBet });

      useGameStore.getState().updateBetStatus('bet-1', BetStatus.CASHED_OUT, {
        multiplier: 2.5,
        payoutCents: 2500,
        payoutDecimal: '25.00',
      });

      const bet = useGameStore.getState().myActiveBet!;
      expect(bet.status).toBe(BetStatus.CASHED_OUT);
      expect(bet.cashOutMultiplier).toBe(2.5);
      expect(bet.payoutCents).toBe(2500);
      expect(bet.payoutDecimal).toBe('25.00');
      expect(bet.cashedOutAt).toBeInstanceOf(Date);
    });

    it('does not update when bet id does not match myActiveBet', () => {
      useGameStore.setState({ myActiveBet: mockBet });

      useGameStore.getState().updateBetStatus('bet-999', BetStatus.LOST);

      expect(useGameStore.getState().myActiveBet!.status).toBe(BetStatus.ACTIVE);
    });

    it('does nothing when myActiveBet is null', () => {
      useGameStore.setState({ myActiveBet: null });

      useGameStore.getState().updateBetStatus('bet-1', BetStatus.LOST);

      expect(useGameStore.getState().myActiveBet).toBeNull();
    });
  });

  describe('setConnectionStatus', () => {
    it('sets connection status to connecting', () => {
      useGameStore.getState().setConnectionStatus('connecting');
      expect(useGameStore.getState().connectionStatus).toBe('connecting');
    });

    it('sets connection status to connected', () => {
      useGameStore.getState().setConnectionStatus('connected');
      expect(useGameStore.getState().connectionStatus).toBe('connected');
    });

    it('sets connection status to error', () => {
      useGameStore.getState().setConnectionStatus('error');
      expect(useGameStore.getState().connectionStatus).toBe('error');
    });
  });

  describe('setConnected', () => {
    it('sets isConnected to true', () => {
      useGameStore.getState().setConnected(true);
      expect(useGameStore.getState().isConnected).toBe(true);
    });

    it('sets isConnected to false', () => {
      useGameStore.setState({ isConnected: true });
      useGameStore.getState().setConnected(false);
      expect(useGameStore.getState().isConnected).toBe(false);
    });
  });

  describe('getBettingTimeRemaining', () => {
    it('returns 0 when there is no bettingEndTime', () => {
      expect(useGameStore.getState().getBettingTimeRemaining()).toBe(0);
    });

    it('returns 0 when roundStatus is not BETTING', () => {
      const bettingEnd = new Date(Date.now() + 5000);
      useGameStore.setState({
        bettingEndTime: bettingEnd,
        roundStatus: RoundStatus.ACTIVE,
      });

      expect(useGameStore.getState().getBettingTimeRemaining()).toBe(0);
    });

    it('returns seconds remaining during betting phase', () => {
      const fiveSecondsFromNow = new Date(Date.now() + 5000);
      useGameStore.setState({
        bettingEndTime: fiveSecondsFromNow,
        roundStatus: RoundStatus.BETTING,
      });

      const remaining = useGameStore.getState().getBettingTimeRemaining();
      expect(remaining).toBeGreaterThan(4.5);
      expect(remaining).toBeLessThanOrEqual(5);
    });

    it('returns 0 when time has expired', () => {
      const past = new Date(Date.now() - 1000);
      useGameStore.setState({
        bettingEndTime: past,
        roundStatus: RoundStatus.BETTING,
      });

      expect(useGameStore.getState().getBettingTimeRemaining()).toBe(0);
    });
  });

  describe('getBettingProgress', () => {
    it('returns 0 when there is no bettingEndTime', () => {
      expect(useGameStore.getState().getBettingProgress()).toBe(0);
    });

    it('returns 0 when roundStatus is not BETTING', () => {
      const bettingEnd = new Date(Date.now() + 5000);
      useGameStore.setState({
        bettingEndTime: bettingEnd,
        roundStatus: RoundStatus.CRASHED,
      });

      expect(useGameStore.getState().getBettingProgress()).toBe(0);
    });

    it('returns 0 at the start of betting phase', () => {
      const bettingEnd = new Date(Date.now() + GAME_CONSTANTS.BETTING_DURATION_MS);
      useGameStore.setState({
        bettingEndTime: bettingEnd,
        roundStatus: RoundStatus.BETTING,
      });

      const progress = useGameStore.getState().getBettingProgress();
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThan(0.1);
    });

    it('returns approximately 0.5 halfway through betting', () => {
      // Betting end is 5s from now, started 5s ago (10s total duration)
      const bettingEnd = new Date(Date.now() + 5000);
      useGameStore.setState({
        bettingEndTime: bettingEnd,
        roundStatus: RoundStatus.BETTING,
      });

      const progress = useGameStore.getState().getBettingProgress();
      expect(progress).toBeGreaterThanOrEqual(0.45);
      expect(progress).toBeLessThanOrEqual(0.55);
    });

    it('returns 1 when betting time has expired', () => {
      const past = new Date(Date.now() - GAME_CONSTANTS.BETTING_DURATION_MS - 1000);
      useGameStore.setState({
        bettingEndTime: past,
        roundStatus: RoundStatus.BETTING,
      });

      expect(useGameStore.getState().getBettingProgress()).toBe(1);
    });

    it('is clamped between 0 and 1', () => {
      const bettingEnd = new Date(Date.now() + 5000);
      useGameStore.setState({
        bettingEndTime: bettingEnd,
        roundStatus: RoundStatus.BETTING,
      });

      const progress = useGameStore.getState().getBettingProgress();
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1);
    });
  });

  describe('rejoinActiveRound', () => {
    it('restores active round state', () => {
      const startedAt = new Date();
      const bets = [mockBet, mockBet2];

      useGameStore.getState().rejoinActiveRound('round-1', 'hash-xyz', startedAt, 3.5, bets);

      const state = useGameStore.getState();
      expect(state.currentRoundId).toBe('round-1');
      expect(state.roundStatus).toBe(RoundStatus.ACTIVE);
      expect(state.liveMultiplier).toBe(3.5);
      expect(state.bettingEndTime).toBeNull();
      expect(state.roundStartedAt).toBe(startedAt);
      expect(state.currentSeedHash).toBe('hash-xyz');
      expect(state.myActiveBet).toBeNull();
      expect(state.currentBets).toEqual(bets);
    });
  });

  describe('setCurrentBets', () => {
    it('replaces current bets entirely', () => {
      useGameStore.setState({ currentBets: [mockBet] });

      useGameStore.getState().setCurrentBets([mockBet2]);

      expect(useGameStore.getState().currentBets).toEqual([mockBet2]);
    });

    it('can clear all bets', () => {
      useGameStore.setState({ currentBets: [mockBet, mockBet2] });

      useGameStore.getState().setCurrentBets([]);

      expect(useGameStore.getState().currentBets).toEqual([]);
    });
  });

  describe('setHydrated', () => {
    it('sets isHydrated to true', () => {
      expect(useGameStore.getState().isHydrated).toBe(false);
      useGameStore.getState().setHydrated();
      expect(useGameStore.getState().isHydrated).toBe(true);
    });
  });
});
