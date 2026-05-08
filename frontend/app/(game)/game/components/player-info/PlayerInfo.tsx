'use client';

import BalanceDisplay from './BalanceDisplay';
import { useWallet } from '@/hooks/useWallet';
import { Wallet } from 'lucide-react';

interface Props {
  username: string;
}

export default function PlayerInfo({ username }: Props) {
  const { balance, isLoading } = useWallet();

  return (
    <div className="bg-zinc-900/50 border border-purple-500/20 rounded-xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-lg font-bold">
          {username?.[0]?.toUpperCase()}
        </div>
        <div>
          <p className="text-sm text-zinc-400">Player</p>
          <p className="font-semibold">{username}</p>
        </div>
      </div>
      
      <div className="border-t border-zinc-800 pt-3">
        <div className="flex items-center gap-2 text-zinc-400 mb-1">
          <Wallet className="w-4 h-4" />
          <span className="text-sm">Balance</span>
        </div>
        <BalanceDisplay balance={balance} isLoading={isLoading} />
      </div>
    </div>
  );
}
