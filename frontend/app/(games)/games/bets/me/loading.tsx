import { TableSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function MyBetsLoading() {
  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="h-4 w-32" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="panel-cyber p-4 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-24" />
          </div>
        ))}
      </div>
      <div className="panel-cyber rounded-lg overflow-hidden">
        <TableSkeleton rows={8} />
      </div>
    </div>
  );
}
