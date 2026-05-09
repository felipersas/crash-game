"use client";

import { motion } from "framer-motion";
import { formatMultiplier } from "@/shared/utils/money";

interface Props {
  multiplier: number;
  phase: "betting" | "active" | "crashed";
  isConnected: boolean;
  connectionStatus?: "connecting" | "connected" | "disconnected" | "error";
  reconnectAttempt?: number;
}

export default function CrashGraph({ multiplier, phase, isConnected, connectionStatus, reconnectAttempt }: Props) {
  const isCrashed = phase === "crashed";
  const colorClass = isCrashed
    ? "text-red-500"
    : multiplier >= 2
      ? "text-green-400"
      : multiplier >= 1.5
        ? "text-yellow-400"
        : "text-purple-400";

  return (
    <div className="relative bg-zinc-900/50 border border-purple-500/20 rounded-xl overflow-hidden h-64">
      {/* Grid background */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(139,92,246,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.1) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />

      {/* Multiplier display */}
      <div className="relative z-10 flex items-center justify-center h-full">
        <motion.div
          key={isCrashed ? "crashed" : multiplier}
          initial={{ scale: 1 }}
          animate={{ scale: isCrashed ? 1.2 : 1 }}
          className={`text-7xl font-black ${colorClass}`}
        >
          {formatMultiplier(multiplier)}
        </motion.div>
      </div>

      {/* Status bar */}
      <div className="absolute bottom-0 left-0 right-0 h-2 bg-zinc-800">
        <motion.div
          className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
          initial={{ width: 0 }}
          animate={{
            width:
              phase === "betting"
                ? "100%"
                : `${Math.min((multiplier - 1) * 10, 100)}%`,
          }}
        />
      </div>

      {/* Connection status indicator */}
      {(!isConnected || connectionStatus === 'error') && (
        <div className="absolute top-2 right-2 flex items-center gap-2">
          <div className={`px-2 py-1 text-xs rounded flex items-center gap-1.5 ${
            connectionStatus === 'error'
              ? 'bg-red-500/20 text-red-400'
              : 'bg-yellow-500/20 text-yellow-400'
          }`}>
            {connectionStatus === 'connecting' && (
              <>
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="inline-block"
                >⚡</motion.span>
                Connecting...
              </>
            )}
            {connectionStatus === 'error' && (
              <>
                <span>⚠️</span>
                {reconnectAttempt && reconnectAttempt > 0
                  ? `Reconnecting (${reconnectAttempt}/10)...`
                  : 'Connection Error'}
              </>
            )}
            {connectionStatus === 'disconnected' && (
              <>
                <span>🔌</span>
                Disconnected
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
