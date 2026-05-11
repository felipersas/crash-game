"use client";

import Link from "next/link";

export default function VerifyError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container mx-auto px-4 py-12 text-center space-y-4">
      <p className="text-error font-terminal uppercase tracking-wider">
        Failed to load verification data
      </p>
      <button
        onClick={reset}
        className="btn-cyber-primary px-6 py-2 rounded-lg text-sm font-terminal"
      >
        Retry
      </button>
      <div>
        <Link
          href="/games/rounds/history"
          className="text-primary hover:text-primary/80 font-terminal text-sm"
        >
          Back to History
        </Link>
      </div>
    </div>
  );
}
