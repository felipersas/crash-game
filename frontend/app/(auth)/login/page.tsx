"use client";

/**
 * Login Page - Redirects to Keycloak
 */

import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const { login, status } = useAuth();
  const router = useRouter();

  if (status === "authenticated") {
    router.push("/games");
    return null;
  }

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-zinc-950">
      <div className="text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
            Crash Game
          </h1>
          <p className="text-zinc-400">Jungle Gaming Casino</p>
        </div>

        <div className="space-y-4">
          <p className="text-zinc-500">Sign in to play</p>
          <Button
            onClick={login}
            size="lg"
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
          >
            Login with Keycloak
          </Button>
        </div>

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
