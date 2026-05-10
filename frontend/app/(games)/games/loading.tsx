import { Skeleton } from "@/components/ui/skeleton";

export default function GamesLoading() {
  return (
    <div className="container mx-auto min-h-screen px-4 pb-4">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
        {/* Graph placeholder */}
        <div className="md:col-span-6 md:order-2">
          <div className="panel-cyber rounded-lg h-80 flex items-center justify-center">
            <Skeleton className="h-8 w-32" />
          </div>
        </div>

        {/* Bet controls placeholder */}
        <div className="md:col-span-3 md:order-1">
          <div className="panel-cyber rounded-lg p-4 space-y-4">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </div>

        {/* Bets list placeholder */}
        <div className="md:col-span-3 md:order-3">
          <div className="panel-cyber rounded-lg p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          </div>
        </div>

        {/* History placeholder */}
        <div className="md:col-span-12 md:order-4">
          <div className="panel-cyber rounded-lg p-4">
            <Skeleton className="h-4 w-24 mb-4" />
            <div className="flex gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-16 rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
