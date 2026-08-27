export default function Skeleton({ className = "", style }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-surface-elevated ${className}`}
      style={style}
    />
  );
}

export function CardSkeleton({ compact = false }) {
  return (
    <div className="card p-4">
      <div className="flex justify-between mb-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className={`h-7 mb-2 ${compact ? "w-32" : "w-48"}`} />
      <Skeleton className="h-4 w-full mb-2" />
      <Skeleton className="h-4 w-3/4 mb-4" />
      <div className="h-2 rounded-full bg-surface-elevated overflow-hidden">
        <Skeleton className="h-full w-1/2" />
      </div>
      <div className="flex justify-between mt-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}