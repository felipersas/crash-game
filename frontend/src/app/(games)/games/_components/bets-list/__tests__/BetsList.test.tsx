import { describe, it, expect, beforeEach } from "vitest";
import { renderWithProviders, screen } from "@tests/helpers";
import { useGameStore } from "@/store/game-store";
import { BetStatus } from "@/types/game.types";
import type { Bet } from "@/types/game.types";
import BetsList from "../BetsList";

const mockBets: Bet[] = [
  {
    id: "bet-1",
    roundId: "round-1",
    playerId: "player-1",
    playerName: "Alice",
    amountCents: 1000,
    amountDecimal: "10.00",
    status: BetStatus.ACTIVE,
    cashOutMultiplier: null,
    payoutCents: null,
    payoutDecimal: null,
    cashedOutAt: null,
  },
  {
    id: "bet-2",
    roundId: "round-1",
    playerId: "player-2",
    playerName: "Bob",
    amountCents: 500,
    amountDecimal: "5.00",
    status: BetStatus.CASHED_OUT,
    cashOutMultiplier: 2.5,
    payoutCents: 1250,
    payoutDecimal: "12.50",
    cashedOutAt: new Date(),
  },
];

beforeEach(() => {
  useGameStore.setState({ currentBets: [] });
});

describe("BetsList", () => {
  it("renders empty state when no bets", () => {
    renderWithProviders(<BetsList />);

    expect(screen.getByText("No active bets")).toBeInTheDocument();
    expect(screen.getByText("Waiting for players...")).toBeInTheDocument();
  });

  it("renders bets from store", () => {
    useGameStore.setState({ currentBets: mockBets });
    renderWithProviders(<BetsList />);

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("displays formatted bet amounts", () => {
    useGameStore.setState({ currentBets: mockBets });
    renderWithProviders(<BetsList />);

    expect(screen.getByText("$10.00")).toBeInTheDocument();
    expect(screen.getByText("$5.00")).toBeInTheDocument();
  });

  it("displays cash out multiplier for cashed out bets", () => {
    useGameStore.setState({ currentBets: mockBets });
    renderWithProviders(<BetsList />);

    expect(screen.getByText("@2.50x")).toBeInTheDocument();
  });

  it('shows "Playing" for active bets', () => {
    useGameStore.setState({ currentBets: mockBets });
    renderWithProviders(<BetsList />);

    expect(screen.getByText("Playing")).toBeInTheDocument();
  });

  it("shows total bet count in footer", () => {
    useGameStore.setState({ currentBets: mockBets });
    renderWithProviders(<BetsList />);

    expect(screen.getByText("Total Bets:")).toBeInTheDocument();
    // "2" appears in both header (player count) and footer (total bets)
    const countElements = screen.getAllByText("2");
    expect(countElements.length).toBe(2);
  });

  it("filters out cancelled bets", () => {
    const cancelledBet: Bet = {
      id: "bet-3",
      roundId: "round-1",
      playerId: "player-3",
      playerName: "Charlie",
      amountCents: 200,
      amountDecimal: "2.00",
      status: BetStatus.CANCELLED,
      cashOutMultiplier: null,
      payoutCents: null,
      payoutDecimal: null,
      cashedOutAt: null,
    };
    useGameStore.setState({ currentBets: [...mockBets, cancelledBet] });
    renderWithProviders(<BetsList />);

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.queryByText("Charlie")).not.toBeInTheDocument();
    // Footer should show 2, not 3
    const countElements = screen.getAllByText("2");
    expect(countElements.length).toBeGreaterThanOrEqual(1);
  });

  it("does not show footer when no bets", () => {
    renderWithProviders(<BetsList />);

    expect(screen.queryByText("Total Bets:")).not.toBeInTheDocument();
  });
});
