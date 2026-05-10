import { LoginActions } from "./login-actions";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login | Crash Game",
  description: "Sign in to play Crash Game",
};

export default function LoginPage() {
  return (
    <div className="flex h-screen items-center justify-center bg-zinc-950">
      <div className="text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
            Crash Game
          </h1>
          <p className="text-zinc-400">Jungle Gaming Casino</p>
        </div>

        <LoginActions />

        <div className="text-sm text-zinc-600">
          <p>
            Test user: <code className="text-purple-400">player</code> /{" "}
            <code className="text-purple-400">player123</code>
          </p>
        </div>
      </div>
    </div>
  );
}
