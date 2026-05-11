"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useRef } from "react";
import { formatMultiplier } from "@/shared/utils/money";
import { useGameStore } from "@/store/game-store";
import type { RoundHistoryItem } from "../round-history/RoundHistoryTable";
import { useCurvePoints } from "./useCurvePoints";

/* ── Types ── */

interface Props {
  multiplier: number;
  phase: "betting" | "active" | "crashed";
  recentRounds?: RoundHistoryItem[];
}

type ColorZone = "error" | "profit" | "warning" | "neutral";

/* ── Pure helpers ── */

function getCrashChipColor(cp: number | null): string {
  if (!cp) return "bg-surface-bright/30 text-text-muted";
  if (cp < 1.5) return "bg-error/20 text-error";
  if (cp < 3) return "bg-warning/20 text-warning";
  return "bg-primary/20 text-primary glow-chip-high";
}

function getColorZone(multiplier: number, crashed: boolean): ColorZone {
  if (crashed) return "error";
  if (multiplier >= 2) return "profit";
  if (multiplier >= 1.5) return "warning";
  return "neutral";
}

const TEXT_CLASS: Record<ColorZone, string> = {
  error: "text-error",
  profit: "text-primary",
  warning: "text-[hsl(var(--warning))]",
  neutral: "text-text-primary",
};

const CURVE_STROKE: Record<ColorZone, string> = {
  error: "hsl(0, 100%, 60%)",
  profit: "hsl(72, 98%, 48%)",
  warning: "hsl(45, 100%, 55%)",
  neutral: "hsl(0, 0%, 100%)",
};

const GLOW_SHADOW: Record<ColorZone, string> = {
  error:
    "0 0 10px hsl(0 100% 60% / 0.7), 0 0 40px hsl(0 100% 60% / 0.3)",
  profit:
    "0 0 10px hsl(72 98% 48% / 0.6), 0 0 30px hsl(72 98% 48% / 0.3), 0 0 60px hsl(72 98% 48% / 0.1)",
  warning:
    "0 0 10px hsl(45 100% 55% / 0.6), 0 0 30px hsl(45 100% 55% / 0.3), 0 0 60px hsl(45 100% 55% / 0.1)",
  neutral:
    "0 0 10px rgba(255,255,255,0.6), 0 0 30px rgba(255,255,255,0.3), 0 0 60px rgba(255,255,255,0.1)",
};

function getStatusLabel(phase: Props["phase"], multiplier: number): string {
  if (phase === "crashed") return "CRASHED";
  if (phase === "betting") return "Awaiting Round";
  return formatMultiplier(multiplier);
}

function getProgressBarWidth(multiplier: number, phase: Props["phase"]): number {
  if (phase === "crashed") return 0;
  if (phase === "betting") {
    const progress = useGameStore.getState().getBettingProgress();
    return (1 - progress) * 100;
  }
  return Math.min((multiplier - 1) * 8, 100);
}

/* ── Sub-components ── */

function MultiplierCurve({
  curveData,
  color,
}: {
  curveData: NonNullable<ReturnType<typeof useCurvePoints>>;
  color: string;
}) {
  const shared = { d: curveData.path, fill: "none" as const, strokeLinecap: "round" as const, vectorEffect: "non-scaling-stroke" as const };
  const transition = { transition: "stroke 0.15s ease-out" };

  return (
    <svg className="absolute inset-0 w-full h-full z-[1]" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.12" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      <path d={curveData.areaPath} fill="url(#area-fill)" />

      <path {...shared} stroke={color} strokeWidth="8" opacity="0.08" style={transition} />
      <path {...shared} stroke={color} strokeWidth="4" opacity="0.18" style={transition} />
      <path {...shared} stroke={color} strokeWidth="2" style={transition} />

      <circle cx={curveData.endX} cy={curveData.endY} r="2" fill={color} opacity="0.15" />
      <circle cx={curveData.endX} cy={curveData.endY} r="1" fill={color} opacity="0.4" />
      <circle cx={curveData.endX} cy={curveData.endY} r="0.5" fill={color} />
    </svg>
  );
}

function BettingCountdown({ timeRemaining }: { timeRemaining: number }) {
  const urgent = timeRemaining <= 3;
  const stroke = urgent ? "hsl(var(--error))" : "hsl(var(--primary))";

  return (
    <div className="space-y-2 mt-3">
      <p className="text-sm text-text-muted font-terminal uppercase tracking-widest">
        Place your bets
      </p>
      <motion.div
        className="flex items-center justify-center gap-3"
        animate={{ opacity: urgent ? [1, 0.5, 1] : 1 }}
        transition={{ duration: 0.5, repeat: urgent ? Infinity : 0 }}
      >
        <div className="relative w-16 h-16">
          <svg className="w-full h-full transform -rotate-90">
            <circle cx="32" cy="32" r="28" fill="none" stroke="hsl(var(--surface-bright))" strokeWidth="4" />
            <motion.circle
              cx="32" cy="32" r="28"
              fill="none"
              stroke={stroke}
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
  );
}

/* ── Main component ── */

export default function CrashGraph({ multiplier, phase, recentRounds = [] }: Props) {
  const isCrashed = phase === "crashed";
  const isBetting = phase === "betting";
  const zone = getColorZone(multiplier, isCrashed);

  const currentSeedHash = useGameStore((s) => s.currentSeedHash);
  const currentRoundId = useGameStore((s) => s.currentRoundId);
  const currentBets = useGameStore((s) => s.currentBets);

  const [timeRemaining, setTimeRemaining] = useState(0);
  const [shouldShake, setShouldShake] = useState(false);
  const prevPhase = useRef(phase);

  const curveData = useCurvePoints(multiplier, phase);

  useEffect(() => {
    if (isBetting) {
      const tick = () => setTimeRemaining(useGameStore.getState().getBettingTimeRemaining());
      tick();
      const id = setInterval(tick, 100);
      return () => clearInterval(id);
    }
    setTimeRemaining(0);
  }, [isBetting]);

  useEffect(() => {
    if (isCrashed && prevPhase.current !== "crashed") {
      setShouldShake(true);
      const id = setTimeout(() => setShouldShake(false), 500);
      return () => clearTimeout(id);
    }
    prevPhase.current = phase;
  }, [phase, isCrashed]);

  return (
    <motion.div
      className={`panel-cyber rounded-lg overflow-hidden relative h-full flex flex-col ${shouldShake ? "animate-glitch" : ""} ${phase === "active" ? "glow-panel-active" : ""}`}
      animate={shouldShake ? { x: [-5, 5, -5, 5, 0] } : {}}
      transition={{ duration: 0.3 }}
    >
      {/* History Bar */}
      <div className="absolute top-0 left-0 right-0 h-12 bg-surface/50 border-b border-border flex items-center px-4 gap-2 overflow-hidden z-20">
        <span className="text-xs text-text-muted font-terminal uppercase shrink-0">History:</span>
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

      {/* Crash Flash */}
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

      {/* Graph Area */}
      <div className="relative flex-1 min-h-80 md:min-h-96 flex items-center justify-center">
        <div className="absolute inset-0 cyber-grid opacity-30" />

        {curveData && <MultiplierCurve curveData={curveData} color={CURVE_STROKE[zone]} />}

        <div className="relative z-10 text-center">
          <motion.div
            className={`font-black font-terminal tracking-tighter ${TEXT_CLASS[zone]} ${isBetting ? "text-3xl md:text-4xl" : "text-7xl md:text-8xl"}`}
            style={(isCrashed || phase === "active") ? { textShadow: GLOW_SHADOW[zone] } : undefined}
          >
            {getStatusLabel(phase, multiplier)}
          </motion.div>

          {isBetting && currentSeedHash && (
            <p className="text-[10px] text-text-muted font-terminal mt-2 break-all px-2" title={currentSeedHash}>
              Hash: {currentSeedHash}
            </p>
          )}

          {isBetting && <BettingCountdown timeRemaining={timeRemaining} />}
        </div>
      </div>

      {/* Progress Bar */}
      {phase !== "active" && (
        <div className="h-2 bg-surface-bright/20 relative overflow-hidden">
          <motion.div
            className={`h-full ${isCrashed ? "bg-error" : "bg-primary"}`}
            initial={{ width: 0 }}
            animate={{ width: `${getProgressBarWidth(multiplier, phase)}%` }}
            transition={{ duration: 0.1 }}
          >
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
              animate={{ x: ["-100%", "100%"] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            />
          </motion.div>
        </div>
      )}

      {/* Status Line */}
      <div className="h-8 bg-surface border-t border-border flex items-center justify-between px-4">
        <div className="flex items-center gap-4 text-xs font-terminal text-text-muted">
          <span>
            ROUND_ID: <span className="text-primary">{currentRoundId ? `${currentRoundId.slice(0, 8)}...` : "---"}</span>
          </span>
          <span>
            PLAYERS: <span className="text-text-primary">{currentBets?.length ?? 0}</span>
          </span>
        </div>
      </div>
    </motion.div>
  );
}
