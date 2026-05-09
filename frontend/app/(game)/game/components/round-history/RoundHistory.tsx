'use client';

import { History, Hash, ExternalLink } from 'lucide-react';
import { formatMultiplier } from '@/shared/utils/money';
import { useState } from 'react';

interface RoundData {
  crashPoint: number;
  id: string;
  seedHash?: string;
  timestamp?: Date;
}

function getCrashColor(crashPoint: number | null): string {
  if (!crashPoint) return 'bg-text-muted/30';
  if (crashPoint >= 10) return 'bg-primary shadow-lg shadow-primary/50';
  if (crashPoint >= 2) return 'bg-primary';
  if (crashPoint >= 1.5) return 'bg-warning';
  return 'bg-error';
}

function getCrashTextColor(crashPoint: number | null): string {
  if (!crashPoint) return 'text-text-muted';
  if (crashPoint >= 2) return 'text-primary';
  if (crashPoint >= 1.5) return 'text-warning';
  return 'text-error';
}

export default function RoundHistory() {
  const [selectedRound, setSelectedRound] = useState<RoundData | null>(null);

  // Mock data - in production this would come from game store or API
  const mockHistory: RoundData[] = [
    { crashPoint: 1.23, id: '0x7F3A2C', seedHash: 'a1b2c3d4...', timestamp: new Date(Date.now() - 5000) },
    { crashPoint: 12.4, id: '0x8E4B1D', seedHash: 'e5f6g7h8...', timestamp: new Date(Date.now() - 25000) },
    { crashPoint: 1.45, id: '0x9D5C3E', seedHash: 'i9j0k1l2...', timestamp: new Date(Date.now() - 45000) },
    { crashPoint: 2.89, id: '0xA2D7F1', seedHash: 'm3n4o5p6...', timestamp: new Date(Date.now() - 65000) },
    { crashPoint: 1.12, id: '0xB3E8A2', seedHash: 'q7r8s9t0...', timestamp: new Date(Date.now() - 85000) },
    { crashPoint: 3.56, id: '0xC4F9B3', seedHash: 'u1v2w3x4...', timestamp: new Date(Date.now() - 105000) },
    { crashPoint: 1.01, id: '0xD5G0C4', seedHash: 'y5z6a7b8...', timestamp: new Date(Date.now() - 125000) },
  ];

  return (
    <div className="panel-cyber rounded-lg p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-black font-terminal uppercase tracking-wider text-primary">
            History
          </h3>
        </div>
        <div className="flex items-center gap-1 text-xs text-text-muted">
          <Hash className="w-3 h-3" />
          <span>Provably Fair</span>
        </div>
      </div>

      {/* History List */}
      <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
        {mockHistory.map((round) => (
          <button
            key={round.id}
            onClick={() => setSelectedRound(round)}
            className="w-full flex items-center justify-between py-3 px-4 bg-surface/30 hover:bg-surface/50 border-l-2 border-transparent hover:border-primary transition-all rounded text-left group"
          >
            {/* Round ID */}
            <span className="text-xs font-terminal text-text-muted group-hover:text-text-primary transition-colors">
              {round.id.slice(0, 8)}...
            </span>

            {/* Color Indicator */}
            <div className={`w-2 h-8 rounded ${getCrashColor(round.crashPoint)}`} />

            {/* Crash Point */}
            <span className={`flex-1 text-right font-terminal text-lg font-bold ${getCrashTextColor(round.crashPoint)}`}>
              {formatMultiplier(round.crashPoint || 0)}
            </span>
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-border">
        <p className="text-xs font-terminal text-text-muted text-center">
          Showing last {mockHistory.length} rounds
        </p>
      </div>

      {/* Round Detail Modal */}
      {selectedRound && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedRound(null)}
        >
          <div
            className="panel-cyber max-w-md w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-black font-terminal uppercase text-primary">
                Round Details
              </h4>
              <button
                onClick={() => setSelectedRound(null)}
                className="text-text-muted hover:text-text-primary"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 font-terminal text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">Round ID:</span>
                <span className="text-text-primary">{selectedRound.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Crash Point:</span>
                <span className={`font-bold ${getCrashTextColor(selectedRound.crashPoint)}`}>
                  {formatMultiplier(selectedRound.crashPoint)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Seed Hash:</span>
                <span className="text-text-primary text-xs">{selectedRound.seedHash}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Timestamp:</span>
                <span className="text-text-primary">
                  {selectedRound.timestamp?.toLocaleTimeString()}
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <button className="w-full flex items-center justify-center gap-2 py-2 text-sm font-terminal text-primary hover:text-primary/80 transition-colors">
                <ExternalLink className="w-4 h-4" />
                Verify on Blockchain
              </button>
            </div>

            <div className="text-xs text-text-muted text-center">
              <p>Provably fair • Verifiable • Immutable</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
