import { LoginActions } from "./login-actions";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login | Crash Game",
  description: "Sign in to play Crash Game",
};

export default function LoginPage() {
  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden bg-background">
      {/* Background layers */}
      <div className="cyber-grid absolute inset-0 opacity-20" />
      <div className="scanlines absolute inset-0" />

      {/* Radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, hsl(var(--primary) / 0.04) 0%, transparent 60%)",
        }}
      />

      {/* Login panel */}
      <div className="panel-cyber relative z-10 w-full max-w-sm px-8 py-10">
        <div className="space-y-8">
          {/* Branding */}
          <div className="space-y-1 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-primary">
              CRASH GAME
            </h1>
            <p className="font-terminal text-xs uppercase tracking-widest text-text-muted">
              Crash Game
            </p>
          </div>

          <LoginActions />

          {/* Test credentials */}
          <div className="border-t border-border pt-4 text-center font-terminal text-xs text-text-muted">
            <p>
              Test:{" "}
              <code className="text-primary">player</code> /{" "}
              <code className="text-primary">player123</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
