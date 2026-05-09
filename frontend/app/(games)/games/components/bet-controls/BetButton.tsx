import { Button } from "@/components/ui/button";
import { ReactNode } from "react";

interface BetButtonsProps {
  onAction: () => void;
  children: ReactNode;
}

export const BetButton = ({ onAction, children }: BetButtonsProps) => {
  return (
    <Button
      variant="outline"
      onClick={onAction}
      className="flex-1 font-terminal text-text-muted hover:border-primary hover:text-primary rounded-2xl"
    >
      {children}
    </Button>
  );
};
