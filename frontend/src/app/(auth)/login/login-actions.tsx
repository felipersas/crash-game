"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Loader2 } from "lucide-react";

export function LoginActions() {
  const { login, status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.push("/games");
  }, [status, router]);

  if (status === "authenticated" || status === "loading") {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-center text-sm text-text-muted">Sign in to play</p>
      <Button onClick={login} size="lg" className="btn-cyber-primary w-full">
        Login with Keycloak
      </Button>
    </div>
  );
}
