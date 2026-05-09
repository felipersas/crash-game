"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useRef } from "react";
import { formatMultiplier } from "@/shared/utils/money";
import { useGameStore } from "@/infrastructure/store/game-store";

interface Props {
  multiplier: number;
  phase: "betting" | "active" | "crashed";
}

export default function CrashGraph({ multiplier, phase }: Props) {
  const isCrashed = phase === "crashed";
  const isBetting = phase === "betting";

  const [timeRemaining, setTimeRemaining] = useState(0);
  const [shouldShake, setShouldShake] = useState(false);
  const prevPhase = useRef(phase);

  // Countdown timer effect
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

  // Crash shake effect
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

  // Get betting progress for progress bar
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
      className={`panel-cyber rounded-lg overflow-hidden relative ${shouldShake ? "animate-glitch" : ""}`}
      animate={shouldShake ? { x: [-5, 5, -5, 5, 0] } : {}}
      transition={{ duration: 0.3 }}
    >
      {/* History Bar - Top */}
      <div className="absolute top-0 left-0 right-0 h-12 bg-surface/50 border-b border-border flex items-center px-4 gap-2 overflow-hidden z-20">
        <span className="text-xs text-text-muted font-terminal uppercase">
          History:
        </span>
        <div className="flex items-center gap-1.5">
          <span className="px-2 py-0.5 text-xs font-terminal bg-error/20 text-error rounded">
            1.23x
          </span>
          <span className="px-2 py-0.5 text-xs font-terminal bg-primary/20 text-primary rounded">
            12.4x
          </span>
          <span className="px-2 py-0.5 text-xs font-terminal bg-error/20 text-error rounded">
            1.45x
          </span>
          <span className="px-2 py-0.5 text-xs font-terminal bg-warning/20 text-warning rounded">
            2.89x
          </span>
          <span className="px-2 py-0.5 text-xs font-terminal bg-error/20 text-error rounded">
            1.12x
          </span>
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
      <div className="relative h-30 md:h-80 flex items-center justify-center">
        {/* Grid Background */}
        <div className="absolute inset-0 cyber-grid opacity-30" />

        {/* Central Multiplier Display */}
        <div className="relative z-10 text-center">
          <motion.div
            className={`font-black font-terminal tracking-tighter ${getMultiplierColor()} ${isBetting ? "text-3xl md:text-4xl" : "text-7xl md:text-8xl"}`}
            animate={
              !isCrashed && !isBetting
                ? {
                    scale: [1, 1.02, 1],
                  }
                : {}
            }
            transition={{
              duration: 0.5,
              repeat: Infinity,
            }}
          >
            {getStatusText()}
          </motion.div>

          {/* Sub-label for betting phase with countdown */}
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
          className={`h-full ${isCrashed ? "bg-error" : isBetting ? "bg-primary" : "bg-primary"}`}
          initial={{ width: 0 }}
          animate={{ width: `${getProgressBarWidth()}%` }}
          transition={{ duration: 0.1 }}
        >
          {/* Animated shine effect */}
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
            ROUND_ID: <span className="text-primary">0x7F3A2C...</span>
          </span>
          <span>
            PLAYERS: <span className="text-text-primary">127</span>
          </span>
          <span>
            TOTAL_BET: <span className="text-text-primary">$12,450.00</span>
          </span>
        </div>
      </div>
    </motion.div>
  );
}
