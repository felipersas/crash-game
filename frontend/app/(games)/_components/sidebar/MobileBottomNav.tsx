"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gamepad2, History, Wallet } from "lucide-react";

const navItems = [
  { href: "/games", label: "Play", icon: Gamepad2 },
  { href: "/games/rounds/history", label: "History", icon: History },
  { href: "/games/bets/me", label: "My Bets", icon: Wallet },
];

export default function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface/95 backdrop-blur-md border-t border-border md:hidden safe-area-bottom">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const isActive =
            item.href === "/games"
              ? pathname === "/games"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-terminal uppercase tracking-wider">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
