import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { formatMoney } from "@/shared/utils/money";

interface Props {
  balance: string;
  isLoading?: boolean;
}

export default function BalanceDisplay({ balance, isLoading }: Props) {
  const displayBalance = useMemo(() => {
    const cents = Math.round(parseFloat(balance || "0") * 100);
    return formatMoney(cents);
  }, [balance]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
        <span className="text-zinc-500">Loading...</span>
      </div>
    );
  }

  return (
    <p className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-500">
      {displayBalance}
    </p>
  );
}
