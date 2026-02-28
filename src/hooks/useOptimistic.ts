import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

/**
 * Optimistic UI update hook.
 * 
 * Shows immediate UI update, syncs in background, reverts on failure.
 * Use for: meal tracking, mark-complete, profile updates, etc.
 */
interface UseOptimisticOptions<T> {
  /** Current value */
  initial: T;
  /** Async function to persist the change */
  onCommit: (newValue: T) => Promise<void>;
  /** Label for error logging */
  label?: string;
}

export function useOptimistic<T>({ initial, onCommit, label }: UseOptimisticOptions<T>) {
  const [value, setValue] = useState<T>(initial);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  const update = useCallback(async (newValue: T) => {
    const previousValue = value;
    setValue(newValue); // Optimistic
    setSyncing(true);

    try {
      await onCommit(newValue);
    } catch (err: any) {
      console.error(`[Optimistic] ${label || "update"} failed, reverting:`, err.message);
      setValue(previousValue); // Rollback
      toast({
        title: "Update failed",
        description: "Your change couldn't be saved. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  }, [value, onCommit, label, toast]);

  return { value, update, syncing };
}
