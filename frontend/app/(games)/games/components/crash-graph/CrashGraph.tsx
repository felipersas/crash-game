"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useRef } from "react";
import { formatMultiplier } from "@/shared/utils/money";
import { useGameStore } from "@/store/game-store";
import type { RoundHistoryItem } from "../round-history/RoundHistoryTable";

interface Props {
  multiplier: number;
  phase: "betting" | "active" | "crashed";
  recentRounds?: RoundHistoryItem[];
}

function getCrashChipColor(cp: number | null): string {
  if (!cp) return "bg-surface-bright/30 text-text-muted";
  if (cp < 1.5) return "bg-error/20 text-error";
  if (cp < 3) return "bg-warning/20 text-warning";
  return "bg-primary/20 text-primary";
}

export default function CrashGraph({ multiplier, phase, recentRounds = [] }: Props) {
  const isCrashed = phase === "crashed";
  const isBetting = phase === "betting";

  const currentSeedHash = useGameStore((s) => s.currentSeedHash);
  const currentRoundId = useGameStore((s) => s.currentRoundId);
  const currentBets = useGameStore((s) => s.currentBets);

  const [timeRemaining, setTimeRemaining] = useState(0);
  const [shouldShake, setShouldShake] = useState(false);
  const prevPhase = useRef(phase);

  useEffect(() => {
    if (isBetting) {
      const updateCountdown = () => {
        const remaining = useGameStore.getState().getBettingTimeRemaining();
        setTimeRemaining(remaining);
      };
      updateCountdown();
      const interval = setInterval(updateCountdown, 100);
      return () => clearInterval(interval);
    } else {
      setTimeRemaining(0);
    }
  }, [isBetting]);

  useEffect(() => {
    if (phase === "crashed" && prevPhase.current !== "crashed") {
      setShouldShake(true);
      setTimeout(() => setShouldShake(false), 500);
    }
    prevPhase.current = phase;
  }, [phase]);

  const getMultiplierColor = () => {
    if (isCrashed) return "text-error";
    if (multiplier >= 10) return "text-primary";
    if (multiplier >= 2) return "text-primary";
    if (multiplier >= 1.5) return "text-[hsl(var(--warning))]";
    return "text-text-primary";
  };

  const getStatusText = () => {
    if (isCrashed) return "CRASHED";
    if (isBetting) return "Awaiting Round";
    return formatMultiplier(multiplier);
  };

  const getProgressBarWidth = () => {
    if (isCrashed) return 0;
    if (isBetting) {
      const progress = useGameStore.getState().getBettingProgress();
      return (1 - progress) * 100;
    }
    return Math.min((multiplier - 1) * 8, 100);
  };

  return (
    <motion.div
      className={`panel-cyber rounded-lg overflow-hidden relative h-full flex flex-col ${shouldShake ? "animate-glitch" : ""}`}
      animate={shouldShake ? { x: [-5, 5, -5, 5, 0] } : {}}
      transition={{ duration: 0.3 }}
    >
      {/* History Bar - Top */}
      <div className="absolute top-0 left-0 right-0 h-12 bg-surface/50 border-b border-border flex items-center px-4 gap-2 overflow-hidden z-20">
        <span className="text-xs text-text-muted font-terminal uppercase shrink-0">
          History:
        </span>
        <div className="flex items-center gap-1.5 overflow-hidden">
          {recentRounds.length > 0 ? (
            recentRounds.map((round) => (
              <span
                key={round.roundId}
                className={`px-2 py-0.5 text-xs font-terminal rounded shrink-0 ${getCrashChipColor(round.crashPoint)}`}
              >
                {formatMultiplier(round.crashPoint || 0)}
              </span>
            ))
          ) : (
            <span className="text-xs text-text-muted font-terminal">---</span>
          )}
        </div>
      </div>

      {/* Crash Flash Effect */}
      <AnimatePresence>
        {isCrashed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.3, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 bg-error pointer-events-none z-30"
          />
        )}
      </AnimatePresence>

      {/* Main Graph Area */}
      <div className="relative flex-1 min-h-64 md:min-h-80 flex items-center justify-center">
        <div className="absolute inset-0 cyber-grid opacity-30" />

        <div className="relative z-10 text-center">
          <motion.div
            className={`font-black font-terminal tracking-tighter ${getMultiplierColor()} ${isBetting ? "text-3xl md:text-4xl" : "text-7xl md:text-8xl"}`}
            animate={!isCrashed && !isBetting ? { scale: [1, 1.02, 1] } : {}}
            transition={{ duration: 0.5, repeat: Infinity }}
          >
            {getStatusText()}
          </motion.div>

          {/* Seed hash display during betting */}
          {isBetting && currentSeedHash && (
            <p
              className="text-[10px] text-text-muted font-terminal mt-2 truncate max-w-xs"
              title={currentSeedHash}
            >
              Hash: {currentSeedHash.slice(0, 16)}...
            </p>
          )}

          {isBetting && (
            <div className="space-y-2 mt-3">
              <p className="text-sm text-text-muted font-terminal uppercase tracking-widest">
                Place your bets
              </p>
              <motion.div
                className="flex items-center justify-center gap-3"
                animate={{ opacity: timeRemaining <= 3 ? [1, 0.5, 1] : 1 }}
                transition={{
                  duration: 0.5,
                  repeat: timeRemaining <= 3 ? Infinity : 0,
                }}
              >
                <div className="relative w-16 h-16">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      fill="none"
                      stroke="hsl(var(--surface-bright))"
                      strokeWidth="4"
                    />
                    <motion.circle
                      cx="32"
                      cy="32"
                      r="28"
                      fill="none"
                      stroke={
                        timeRemaining <= 3
                          ? "hsl(var(--error))"
                          : "hsl(var(--primary))"
                      }
                      strokeWidth="4"
                      strokeLinecap="round"
                      initial={{ pathLength: 1 }}
                      animate={{ pathLength: Math.max(0, timeRemaining / 10) }}
                      style={{ strokeDasharray: "175.93", strokeDashoffset: 0 }}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xl font-bold font-terminal">
                    {Math.ceil(timeRemaining)}
                  </span>
                </div>
              </motion.div>
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-surface-bright/20 relative overflow-hidden">
        <motion.div
          className={`h-full ${isCrashed ? "bg-error" : "bg-primary"}`}
          initial={{ width: 0 }}
          animate={{ width: `${getProgressBarWidth()}%` }}
          transition={{ duration: 0.1 }}
        >
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
            animate={{ x: ["-100%", "100%"] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          />
        </motion.div>
      </div>

      {/* Bottom Status Line */}
      <div className="h-8 bg-surface border-t border-border flex items-center justify-between px-4">
        <div className="flex items-center gap-4 text-xs font-terminal text-text-muted">
          <span>
            ROUND_ID:{" "}
            <span className="text-primary">
              {currentRoundId ? `${currentRoundId.slice(0, 8)}...` : "---"}
            </span>
          </span>
          <span>
            PLAYERS:{" "}
            <span className="text-text-primary">
              {currentBets?.length ?? 0}
            </span>
          </span>
        </div>
      </div>
    </motion.div>
  );
}
