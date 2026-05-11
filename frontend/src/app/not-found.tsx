import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-void px-4">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-black font-terminal uppercase tracking-widest text-primary animate-pulse">
          404
        </h1>
        <p className="text-lg font-terminal text-text-muted uppercase tracking-wider">
          Route not found
        </p>
        <p className="text-sm font-terminal text-text-muted/60">
          The page you are looking for does not exist or has been moved.
        </p>
      </div>

      <Link
        href="/games"
        className="btn-cyber-primary px-8 py-3 rounded-lg text-sm font-terminal uppercase tracking-widest"
      >
        Back to Game
      </Link>
    </div>
  );
}
