import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/get-query-client";
import { fetchRoundHistory } from "@/lib/server-fetch";
import { GameContent } from "./game-content";

export default async function GamesPage() {
  const queryClient = getQueryClient();

  await queryClient.prefetchQuery({
    queryKey: ["round-history", 1, 10],
    queryFn: () => fetchRoundHistory({ page: 1, limit: 10 }),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <GameContent />
    </HydrationBoundary>
  );
}
