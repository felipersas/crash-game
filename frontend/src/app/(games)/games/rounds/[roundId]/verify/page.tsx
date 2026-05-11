import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";
import { getQueryClient } from "@/libs/get-query-client";
import { fetchVerifyRound } from "@/libs/server-fetch";
import { VerifyRoundClient } from "./verify-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify Round | Crash Game",
  description: "Verify the fairness of a crash game round",
};

export default async function VerifyRoundPage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const { roundId } = await params;
  const queryClient = getQueryClient();

  await queryClient.prefetchQuery({
    queryKey: ["verify-round", roundId],
    queryFn: () => fetchVerifyRound(roundId),
  });

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-2xl">
      <Link
        href="/games/rounds/history"
        className="inline-flex items-center gap-2 text-sm font-terminal text-text-muted hover:text-primary transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to History
      </Link>

      <div className="panel-cyber p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-black font-terminal uppercase tracking-wider text-primary">
            Round Verification
          </h1>
        </div>

        <HydrationBoundary state={dehydrate(queryClient)}>
          <VerifyRoundClient roundId={roundId} />
        </HydrationBoundary>
      </div>
    </div>
  );
}
