import { TableSkeleton } from "@/components/ui/Skeleton";

export default function RoundHistoryLoading() {
  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="h-4 w-32" />
      <div className="panel-cyber p-4 h-16" />
      <div className="panel-cyber rounded-lg overflow-hidden">
        <TableSkeleton rows={10} />
      </div>
    </div>
  );
}
