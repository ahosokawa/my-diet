export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-surface-3 ${className}`}
      aria-hidden="true"
    />
  );
}
