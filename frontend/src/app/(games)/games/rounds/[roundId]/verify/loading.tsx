import { Skeleton } from "@/components/ui/Skeleton";

export default function VerifyLoading() {
  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-2xl">
      <div className="h-4 w-32" />
      <div className="panel-cyber p-6 space-y-4">
        <Skeleton className="h-6 w-48" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-40" />
          </div>
        ))}
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </div>
  );
}
