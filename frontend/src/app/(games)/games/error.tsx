"use client";

export default function GamesError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4">
      <div className="panel-cyber rounded-lg p-8 text-center space-y-4 max-w-md">
        <p className="text-error font-terminal text-lg uppercase tracking-wider">
          Game Error
        </p>
        <p className="text-text-muted font-terminal text-sm">
          Failed to load the game. Please try again.
        </p>
        <button
          onClick={reset}
          className="btn-cyber-primary px-6 py-2 rounded-lg text-sm font-terminal"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
