import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { formatMoney } from '@/shared/utils/money';

interface Props {
  balance: string;
  isLoading?: boolean;
}

export default function BalanceDisplay({ balance, isLoading }: Props) {
  const displayBalance = useMemo(() => {
    const cents = Math.round(parseFloat(balance || '0') * 100);
    return formatMoney(cents);
  }, [balance]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="text-text-muted font-terminal text-sm">Loading...</span>
      </div>
    );
  }

  return (
    <p className="text-3xl font-black font-terminal text-primary glow-primary-subtle">
      {displayBalance}
    </p>
  );
}
