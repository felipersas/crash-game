import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getServerSession } from "next-auth";
import { getQueryClient } from "@/lib/get-query-client";
import { fetchMyBets } from "@/lib/server-fetch";
import { authOptions } from "@/infrastructure/auth/nextauth.config";
import { MyBetsClient } from "./my-bets-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Bets | Crash Game",
  description: "View your bet history and profit/loss summary",
};

export default async function MyBetsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return (
      <div className="container mx-auto px-4 py-12 text-center space-y-4">
        <p className="font-terminal text-text-muted">
          You need to be logged in to view your bets.
        </p>
        <Link
          href="/login"
          className="btn-cyber-primary px-6 py-2 rounded-lg text-sm font-terminal inline-block"
        >
          Log In
        </Link>
      </div>
    );
  }

  const queryClient = getQueryClient();

  await queryClient.prefetchQuery({
    queryKey: ["my-bets", 1, 20],
    queryFn: () => fetchMyBets({ page: 1, limit: 20 }, session.accessToken!),
  });

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <Link
        href="/games"
        className="inline-flex items-center gap-2 text-sm font-terminal text-text-muted hover:text-primary transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Game
      </Link>

      <HydrationBoundary state={dehydrate(queryClient)}>
        <MyBetsClient />
      </HydrationBoundary>
    </div>
  );
}
