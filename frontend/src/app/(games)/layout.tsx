import { ReactNode } from "react";
import Sidebar from "./_components/sidebar/Sidebar";
import MobileBottomNav from "./_components/sidebar/MobileBottomNav";
import GameLayout from "./games/_components/game-layout/GameLayout";

export default function GamesLayout({ children }: { children: ReactNode }) {
  return (
    <GameLayout>
      <div className="flex">
        {/* Desktop sidebar */}
        <Sidebar className="hidden md:flex" />

        {/* Main content with sidebar offset */}
        <div className="flex-1 md:ml-56 min-w-0 pb-20 md:pb-0">
          {children}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <MobileBottomNav />
    </GameLayout>
  );
}
