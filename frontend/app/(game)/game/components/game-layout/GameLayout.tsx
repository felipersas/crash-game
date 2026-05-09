"use client";

import { Bell, Settings, User, Plus, Cpu } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";

export default function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { balance } = useWallet();

  return (
    <div className="min-h-screen bg-background relative">
      {/* Background Effects */}
      <div className="fixed inset-0 cyber-grid opacity-10 pointer-events-none" />
      <div className="fixed inset-0 scanlines opacity-30 pointer-events-none" />

      {/* Fixed Top Navigation Bar */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-surface/90 backdrop-blur-md border-b border-border">
        <div className="h-full flex items-center justify-between px-6">
          {/* Left - Brand Logo */}
          {/* Center - Status Indicator */}
          <div className="flex items-center gap-2"></div>

          {/* Right - Wallet & Utilities */}
          <div className="flex items-center gap-6">
            {/* Wallet Display */}
            <div className="flex items-center gap-3 bg-surface-bright/50 border border-border-bright rounded px-4 py-2">
              <span className="text-xs text-text-muted font-terminal uppercase">
                Balance
              </span>
              <span className="text-lg font-bold font-terminal text-text-primary">
                ${Number(balance ?? 0).toFixed(2)}
              </span>
            </div>

            {/* Utility Icons */}
            <div className="flex items-center gap-3 text-text-muted">
              <button className="hover:text-primary transition-colors">
                <Bell className="w-5 h-5" />
              </button>
              <button className="hover:text-primary transition-colors">
                <Settings className="w-5 h-5" />
              </button>
              <button className="hover:text-primary transition-colors">
                <User className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Padded for fixed header */}
      <main className="pt-20">{children}</main>
    </div>
  );
}
