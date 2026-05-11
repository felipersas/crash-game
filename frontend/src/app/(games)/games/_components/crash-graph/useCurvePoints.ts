import { useMemo } from "react";
import { useGameStore } from "@/store/game-store";

export type Phase = "betting" | "active" | "crashed";

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
  if (elapsedMs < 50 || multiplier <= 1.001) return null;

  const pad = { left: 4, right: 2, top: 4, bottom: 2 };
  const plotW = 100 - pad.left - pad.right;
  const plotH = 100 - pad.top - pad.bottom;

  const maxTime = Math.max(elapsedMs, 500);
  const maxMult = Math.max(multiplier * 1.15, 2);

  const toX = (t: number) => pad.left + (t / maxTime) * plotW;
  const toY = (m: number) => pad.top + plotH - ((m - 1) / (maxMult - 1)) * plotH;

  // Generate deterministic exponential curve: y = e^(k*t)
  const k = Math.log(multiplier) / elapsedMs;
  const numPoints = Math.min(60, Math.max(8, Math.floor(elapsedMs / 200)));
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

export function useCurvePoints(multiplier: number, phase: Phase): CurveData | null {
  const roundStartedAt = useGameStore((s) => s.roundStartedAt);

  return useMemo(() => {
    if (phase === "betting") return null;

    const elapsedMs = roundStartedAt
      ? Date.now() - new Date(roundStartedAt).getTime()
      : 0;

    return computeCurve(multiplier, elapsedMs);
  }, [multiplier, phase, roundStartedAt]);
}
