import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export const CardSkeleton = ({ lines = 3 }: { lines?: number }) => (
  <Card>
    <CardHeader>
      <Skeleton className="h-5 w-1/3" />
    </CardHeader>
    <CardContent className="space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" style={{ width: `${85 - i * 15}%` }} />
      ))}
    </CardContent>
  </Card>
);

export const GridSkeleton = ({ cards = 4 }: { cards?: number }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {Array.from({ length: cards }).map((_, i) => (
      <CardSkeleton key={i} />
    ))}
  </div>
);

export const CalendarSkeleton = () => (
  <div className="space-y-2">
    <div className="flex items-center justify-between mb-4">
      <Skeleton className="h-6 w-40" />
      <div className="flex gap-1">
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-8 w-16 rounded" />
        <Skeleton className="h-8 w-8 rounded" />
      </div>
    </div>
    <div className="grid grid-cols-7 gap-px">
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton key={i} className="h-5 w-8 mx-auto" />
      ))}
    </div>
    <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
      {Array.from({ length: 35 }).map((_, i) => (
        <div key={i} className="min-h-[80px] bg-card p-1.5">
          <Skeleton className="h-4 w-4 rounded-full mb-1" />
          <Skeleton className="h-3 w-full mt-1" />
        </div>
      ))}
    </div>
  </div>
);

export const TableSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="space-y-2">
    {Array.from({ length: rows }).map((_, i) => (
      <Skeleton key={i} className="h-12 w-full rounded" />
    ))}
  </div>
);

export const RetryBanner = ({ onRetry, message }: { onRetry: () => void; message?: string }) => (
  <div className="flex flex-col items-center justify-center py-12 gap-3">
    <p className="text-sm text-muted-foreground">{message || "Failed to load. Tap to retry."}</p>
    <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
      <RefreshCw className="h-4 w-4" /> Retry
    </Button>
  </div>
);
