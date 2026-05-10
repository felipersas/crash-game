"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gamepad2, History, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const navItems = [
  { href: "/games", label: "Play", icon: Gamepad2 },
  { href: "/games/rounds/history", label: "History", icon: History },
  { href: "/games/bets/me", label: "My Bets", icon: Wallet },
];

export default function Sidebar({ className = "" }: { className?: string }) {
  const pathname = usePathname();

  return (
    <aside
      className={`fixed top-16 left-0 bottom-0 w-56 bg-surface/95 backdrop-blur-md border-r border-border z-40 flex flex-col ${className}`}
    >
      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive =
            item.href === "/games"
              ? pathname === "/games"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                buttonVariants({ variant: isActive ? "secondary" : "ghost" }),
                "w-full justify-start gap-3 font-terminal uppercase tracking-wider text-sm h-10",
                isActive ? "text-primary" : "text-text-muted",
              )}
            >
              <item.icon
                className={`w-5 h-5 ${isActive ? "text-primary" : ""}`}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Separator />
      <div className="px-4 py-3">
        <p className="text-[10px] font-terminal text-text-muted uppercase tracking-widest text-center">
          Provably Fair
        </p>
      </div>
    </aside>
  );
}
