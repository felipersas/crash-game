"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useRef, useMemo } from "react";
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

/* ── Curve math ── */

interface CurveData {
  path: string;
  areaPath: string;
  endX: number;
  endY: number;
}

function computeCurve(points: Array<[number, number]>): CurveData | null {
  if (points.length < 2) return null;

  const padL = 4, padR = 2, padT = 4, padB = 2;
  const plotW = 100 - padL - padR;
  const plotH = 100 - padT - padB;

  const maxTime = Math.max(points[points.length - 1][0], 500);
  const maxMult = Math.max(points[points.length - 1][1] * 1.15, 2);

  const toX = (t: number) => padL + (t / maxTime) * plotW;
  const toY = (m: number) => padT + plotH - ((m - 1) / (maxMult - 1)) * plotH;

  const coords = points.map(([t, m]) => ({ x: toX(t), y: toY(m) }));

  let path = `M${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;

  if (coords.length === 2) {
    path += ` L${coords[1].x.toFixed(1)},${coords[1].y.toFixed(1)}`;
  } else {
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[Math.max(0, i - 1)];
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const p3 = coords[Math.min(coords.length - 1, i + 2)];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      path += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)},${cp2x.toFixed(1)},${cp2y.toFixed(1)},${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
  }

  const endX = coords[coords.length - 1].x;
  const endY = coords[coords.length - 1].y;
  const startX = coords[0].x;
  const bottomY = padT + plotH;

  const areaPath = `${path} L${endX.toFixed(1)},${bottomY.toFixed(1)} L${startX.toFixed(1)},${bottomY.toFixed(1)} Z`;

  return { path, areaPath, endX, endY };
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

  // Curve data collection
  const pointsRef = useRef<Array<[number, number]>>([]);
  const startTimeRef = useRef(0);
  const prevPhaseCurveRef = useRef(phase);

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

  // Collect curve points during active phase
  useEffect(() => {
    if (phase === "active" && prevPhaseCurveRef.current !== "active") {
      pointsRef.current = [[0, multiplier]];
      startTimeRef.current = performance.now();
    } else if (phase === "active") {
      const elapsed = performance.now() - startTimeRef.current;
      pointsRef.current.push([elapsed, multiplier]);
      if (pointsRef.current.length > 500) {
        pointsRef.current = pointsRef.current.filter((_, i) => i % 2 === 0);
      }
    } else if (phase === "betting" && prevPhaseCurveRef.current !== "betting") {
      pointsRef.current = [];
    }
    prevPhaseCurveRef.current = phase;
  }, [multiplier, phase]);

  // Compute SVG curve from collected points
  const curveData = useMemo(() => {
    if (isBetting) return null;
    return computeCurve(pointsRef.current);
  }, [multiplier, phase]);

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

  const curveColor = isCrashed
    ? "hsl(0, 100%, 60%)"
    : multiplier >= 2
      ? "hsl(72, 98%, 48%)"
      : multiplier >= 1.5
        ? "hsl(45, 100%, 55%)"
        : "hsl(0, 0%, 100%)";

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
      <div className="relative flex-1 min-h-80 md:min-h-96 flex items-center justify-center">
        <div className="absolute inset-0 cyber-grid opacity-30" />

        {/* Curve SVG Layer */}
        {curveData && (
          <svg
            className="absolute inset-0 w-full h-full z-[1]"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={curveColor} stopOpacity="0.12" />
                <stop offset="100%" stopColor={curveColor} stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Filled area under curve */}
            <path d={curveData.areaPath} fill="url(#area-fill)" />

            {/* Wide glow layer */}
            <path
              d={curveData.path}
              stroke={curveColor}
              strokeWidth="8"
              fill="none"
              opacity="0.08"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ transition: "stroke 0.15s ease-out" }}
            />

            {/* Medium glow layer */}
            <path
              d={curveData.path}
              stroke={curveColor}
              strokeWidth="4"
              fill="none"
              opacity="0.18"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ transition: "stroke 0.15s ease-out" }}
            />

            {/* Sharp curve line */}
            <path
              d={curveData.path}
              stroke={curveColor}
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ transition: "stroke 0.15s ease-out" }}
            />

            {/* Endpoint glow */}
            <circle
              cx={curveData.endX}
              cy={curveData.endY}
              r="2"
              fill={curveColor}
              opacity="0.15"
            />
            <circle
              cx={curveData.endX}
              cy={curveData.endY}
              r="1"
              fill={curveColor}
              opacity="0.4"
            />
            {/* Endpoint dot */}
            <circle
              cx={curveData.endX}
              cy={curveData.endY}
              r="0.5"
              fill={curveColor}
            />
          </svg>
        )}

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
              className="text-[10px] text-text-muted font-terminal mt-2 break-all px-2"
              title={currentSeedHash}
            >
              Hash: {currentSeedHash}
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
