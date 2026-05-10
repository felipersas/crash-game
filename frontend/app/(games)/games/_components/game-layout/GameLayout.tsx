"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, LogOut, Settings, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { formatMoney } from "@/shared/utils/money";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { balance } = useWallet();
  const { logout } = useAuth();

  const prevBalance = useRef(balance);
  const [balanceGlow, setBalanceGlow] = useState<"win" | "lose" | null>(null);

  useEffect(() => {
    if (prevBalance.current === balance || prevBalance.current == null) {
      prevBalance.current = balance;
      return;
    }
    const prev = Number(prevBalance.current) || 0;
    const curr = Number(balance) || 0;
    if (curr > prev) {
      setBalanceGlow("win");
    } else if (curr < prev) {
      setBalanceGlow("lose");
    }
    prevBalance.current = balance;
    const id = setTimeout(() => setBalanceGlow(null), 1500);
    return () => clearTimeout(id);
  }, [balance]);

  return (
    <div className="min-h-screen bg-background relative">
      {/* Background Effects */}
      <div className="fixed inset-0 cyber-grid opacity-10 pointer-events-none" />
      <div className="fixed inset-0 scanlines opacity-30 pointer-events-none" />

      {/* Fixed Top Navigation Bar */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-surface/90 backdrop-blur-md border-b border-border">
        <div className="h-full flex items-center justify-between px-6">
          <div />

          {/* Right - Wallet & Utilities */}
          <div className="flex items-center gap-6">
            {/* Wallet Display */}
            <div className="flex items-center gap-3 border border-primary-bright rounded-full px-4 py-2">
              <span className="text-xs text-text-muted font-terminal uppercase">
                Balance
              </span>
              <span className={`text-lg font-bold font-terminal text-text-primary ${balanceGlow === "win" ? "glow-balance-win" : balanceGlow === "lose" ? "glow-balance-lose" : ""}`}>
                {formatMoney(Number(balance) || 0)}
              </span>
            </div>

            {/* Utility Icons */}
            <div className="flex items-center gap-3 text-text-muted">
              <button className="hover:text-primary transition-colors" aria-label="Notifications">
                <Bell className="w-5 h-5" />
              </button>
              <button className="hover:text-primary transition-colors" aria-label="Settings">
                <Settings className="w-5 h-5" />
              </button>
              <Popover>
                <PopoverTrigger className="hover:text-primary transition-colors" aria-label="Profile">
                  <User className="w-5 h-5" />
                </PopoverTrigger>
                <PopoverContent align="end" side="bottom" className="w-44 p-1 bg-surface border border-border text-text-primary shadow-lg">
                  <button
                    onClick={() => logout()}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-muted hover:text-error hover:bg-surface-bright/50 rounded-md transition-colors font-terminal"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Padded for fixed header */}
      <main className="pt-20">{children}</main>
    </div>
  );
}
