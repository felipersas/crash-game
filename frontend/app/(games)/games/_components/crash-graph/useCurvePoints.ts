import { useEffect, useRef, useMemo } from "react";
import { useGameStore } from "@/store/game-store";

export type Phase = "betting" | "active" | "crashed";
type DataPoint = [number, number]; // [elapsedMs, multiplier]

export interface CurveData {
  path: string;
  areaPath: string;
  endX: number;
  endY: number;
}

const MAX_POINTS = 500;

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

function computeCurve(points: DataPoint[]): CurveData | null {
  if (points.length < 2) return null;

  const pad = { left: 4, right: 2, top: 4, bottom: 2 };
  const plotW = 100 - pad.left - pad.right;
  const plotH = 100 - pad.top - pad.bottom;

  const maxTime = Math.max(points[points.length - 1][0], 500);
  const maxMult = Math.max(points[points.length - 1][1] * 1.15, 2);

  const toX = (t: number) => pad.left + (t / maxTime) * plotW;
  const toY = (m: number) => pad.top + plotH - ((m - 1) / (maxMult - 1)) * plotH;

  const coords = points.map(([t, m]) => ({ x: toX(t), y: toY(m) }));
  const path = buildCatmullRomPath(coords);

  const endX = coords[coords.length - 1].x;
  const endY = coords[coords.length - 1].y;
  const bottomY = pad.top + plotH;

  const areaPath = `${path} L${endX.toFixed(1)},${bottomY.toFixed(1)} L${coords[0].x.toFixed(1)},${bottomY.toFixed(1)} Z`;

  return { path, areaPath, endX, endY };
}

function buildSyntheticCurve(elapsedMs: number, multiplier: number): DataPoint[] {
  if (elapsedMs < 100 || multiplier <= 1.01) return [[0, multiplier]];
  const numPoints = Math.min(30, Math.max(8, Math.floor(elapsedMs / 250)));
  const k = Math.log(multiplier) / elapsedMs;
  const points: DataPoint[] = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = (i / numPoints) * elapsedMs;
    points.push([t, Math.exp(k * t)]);
  }
  return points;
}

export function useCurvePoints(multiplier: number, phase: Phase): CurveData | null {
  const pointsRef = useRef<DataPoint[]>([]);
  const startTimeRef = useRef(0);
  const prevPhaseRef = useRef<Phase>(phase);
  const initializedRef = useRef(false);
  const roundStartedAt = useGameStore((s) => s.roundStartedAt);

  useEffect(() => {
    const prev = prevPhaseRef.current;

    if (phase === "active" && prev !== "active") {
      if (roundStartedAt) {
        initializedRef.current = true;
        const elapsedMs = Date.now() - roundStartedAt.getTime();
        startTimeRef.current = performance.now() - elapsedMs;
        pointsRef.current = buildSyntheticCurve(elapsedMs, multiplier);
      } else {
        startTimeRef.current = performance.now();
        pointsRef.current = [[0, 1.0]];
        initializedRef.current = true;
      }
    } else if (phase === "active" && !initializedRef.current) {
      initializedRef.current = true;
      if (roundStartedAt) {
        const elapsedMs = Date.now() - roundStartedAt.getTime();
        startTimeRef.current = performance.now() - elapsedMs;
        pointsRef.current = buildSyntheticCurve(elapsedMs, multiplier);
      } else {
        startTimeRef.current = performance.now();
        pointsRef.current = [[0, multiplier]];
      }
    } else if (phase === "active" && pointsRef.current.length > 0) {
      const elapsed = performance.now() - startTimeRef.current;
      const last = pointsRef.current[pointsRef.current.length - 1];
      const multJump = multiplier - last[1];

      if (multJump > 0.5 && elapsed - last[0] < 500) {
        const gapTime = elapsed - last[0];
        const k = Math.log(multiplier / last[1]) / gapTime;
        const numInterp = Math.max(5, Math.min(25, Math.floor(gapTime / 100)));
        const interpPoints: DataPoint[] = [];
        for (let i = 1; i < numInterp; i++) {
          const t = last[0] + (i / numInterp) * gapTime;
          interpPoints.push([t, last[1] * Math.exp(k * (t - last[0]))]);
        }
        pointsRef.current.push(...interpPoints);
      }

      pointsRef.current.push([elapsed, multiplier]);
      if (pointsRef.current.length > MAX_POINTS) {
        pointsRef.current = pointsRef.current.filter((_, i) => i % 2 === 0);
      }
    } else if (phase === "betting" && prev !== "betting") {
      pointsRef.current = [];
      initializedRef.current = false;
    }

    prevPhaseRef.current = phase;
  }, [multiplier, phase, roundStartedAt]);

  return useMemo(() => {
    if (phase === "betting") return null;
    return computeCurve(pointsRef.current);
  }, [multiplier, phase]);
}
