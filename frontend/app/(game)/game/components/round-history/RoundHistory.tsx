'use client';

import { useGame } from '@/hooks/useGame';
import { formatMultiplier } from '@/shared/utils/money';

function getColor(crashPoint: number | null) {
  if (!crashPoint) return 'bg-zinc-700';
  if (crashPoint >= 2) return 'bg-green-500';
  if (crashPoint >= 1.5) return 'bg-yellow-500';
  return 'bg-red-500';
}

export default function RoundHistory() {
  // Mock data for now
  const mockHistory = [
    { crashPoint: 1.23, status: 'CRASHED' },
    { crashPoint: 3.45, status: 'CRASHED' },
    { crashPoint: 1.12, status: 'CRASHED' },
    { crashPoint: 2.89, status: 'CRASHED' },
    { crashPoint: 1.67, status: 'CRASHED' },
  ];

  return (
    <div className="bg-zinc-900/50 border border-purple-500/20 rounded-xl p-4">
      <h3 className="text-lg font-semibold mb-3">History</h3>
      
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {mockHistory.map((round, i) => (
          <div 
            key={i}
            className="flex items-center justify-between py-2 px-3 bg-zinc-800/50 rounded-lg"
          >
            <div className={`w-3 h-3 rounded-full ${getColor(round.crashPoint)}`} />
            <span className="text-sm font-mono">
              {formatMultiplier(round.crashPoint || 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
