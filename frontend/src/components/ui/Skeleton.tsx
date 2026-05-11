import { cn } from "@/utils/helpers";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded bg-surface-bright/20",
        className,
      )}
    />
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-0">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-6 gap-2 px-4 py-3 border-b border-border/50"
        >
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-10 ml-auto" />
        </div>
      ))}
    </div>
  );
}

export function InlineSkeleton({ className }: SkeletonProps) {
  return (
    <div className="flex items-center justify-center gap-2 py-4">
      <Skeleton className={cn("h-4 w-4 rounded-full", className)} />
      <Skeleton className={cn("h-4 w-24", className)} />
      <Skeleton className={cn("h-4 w-4 rounded-full", className)} />
      <Skeleton className={cn("h-4 w-16", className)} />
    </div>
  );
}
