"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export function LoginActions() {
  const { login, status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.push("/games");
  }, [status, router]);

  if (status === "authenticated" || status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
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
  );
}
