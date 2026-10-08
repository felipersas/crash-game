import { useMemo, useState, useEffect } from "react";
import { useGameStore } from "@/store/game-store";
import type { Phase } from "@/types";

export interface CurveData {
  path: string;
  areaPath: string;
  endX: number;
  endY: number;
}

function buildCatmullRomPath(coords: Array<{ x: number; y: number }>): string {
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(coords[0].x)},${f(coords[0].y)}`;

  if (coords.length === 2) {
    d += ` L${f(coords[1].x)},${f(coords[1].y)}`;
    return d;
  }

  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[Math.max(0, i - 1)];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[Math.min(coords.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C${f(cp1x)},${f(cp1y)},${f(cp2x)},${f(cp2y)},${f(p2.x)},${f(p2.y)}`;
  }

  return d;
}

function computeCurve(multiplier: number, elapsedMs: number): CurveData | null {
  if (elapsedMs < 16 || multiplier <= 1.0001) return null;

  const pad = { left: 4, right: 2, top: 4, bottom: 2 };
  const plotW = 100 - pad.left - pad.right;
  const plotH = 100 - pad.top - pad.bottom;

  const maxTime = Math.max(elapsedMs, 500);
  const maxMult = Math.max(multiplier * 1.15, 2);

  const toX = (t: number) => pad.left + (t / maxTime) * plotW;
  const toY = (m: number) => pad.top + plotH - ((m - 1) / (maxMult - 1)) * plotH;

  // Exponential curve: y = e^(k*t)
  const k = Math.log(multiplier) / elapsedMs;
  // Always at least 30 points for smooth Catmull-Rom
  const numPoints = Math.max(30, Math.min(80, Math.floor(elapsedMs / 50)));
  const coords: Array<{ x: number; y: number }> = [];

  for (let i = 0; i <= numPoints; i++) {
    const t = (i / numPoints) * elapsedMs;
    const m = Math.exp(k * t);
    coords.push({ x: toX(t), y: toY(m) });
  }

  const path = buildCatmullRomPath(coords);

  const endX = coords[coords.length - 1].x;
  const endY = coords[coords.length - 1].y;
  const bottomY = pad.top + plotH;

  const areaPath = `${path} L${endX.toFixed(1)},${bottomY.toFixed(1)} L${coords[0].x.toFixed(1)},${bottomY.toFixed(1)} Z`;

  return { path, areaPath, endX, endY };
}

/**
 * Animates the crash curve at 60fps using requestAnimationFrame.
 * Interpolates elapsed time between WebSocket multiplier updates
 * so the curve grows smoothly instead of jumping.
 *
 * The frame clock (`now`) is state written from rAF callbacks, so render
 * stays pure (no Date.now() during render).
 */
export function useCurvePoints(multiplier: number, phase: Phase): CurveData | null {
  const roundStartedAt = useGameStore((s) => s.roundStartedAt);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (phase === "betting") return;
    // Active: tick every frame. Crashed: render one final frame and stop.
    let rafId = requestAnimationFrame(function frame() {
      setNow(Date.now());
      if (phase === "active") rafId = requestAnimationFrame(frame);
    });
    return () => cancelAnimationFrame(rafId);
  }, [phase]);

  return useMemo(() => {
    if (phase === "betting" || !roundStartedAt || now === null) return null;
    const elapsedMs = now - new Date(roundStartedAt).getTime();
    return computeCurve(multiplier, elapsedMs);
  }, [now, multiplier, phase, roundStartedAt]);
}
