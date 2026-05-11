"use client";

import { Button } from "@/components/ui/Button";
import { ReactNode } from "react";

interface BetButtonsProps {
  onAction: () => void;
  children: ReactNode;
}

export const BetButton = ({ onAction, children }: BetButtonsProps) => {
  return (
    <Button
      variant="default"
      onClick={onAction}
      className="flex-1 font-terminal rounded-2xl py-5 text-base text-black uppercase tracking-wider font-black"
    >
      {children}
    </Button>
  );
};
