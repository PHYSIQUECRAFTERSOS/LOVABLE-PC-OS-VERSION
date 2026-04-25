import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, MessageSquare } from "lucide-react";
import { Dialog, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import ThreadChatView from "@/components/messaging/ThreadChatView";

interface MessagesPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  clientAvatar?: string | null;
}

const MessagesPopup = ({
  open,
  onOpenChange,
  clientId,
  clientName,
  clientAvatar,
}: MessagesPopupProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !user || !clientId) return;
    let cancelled = false;

    const init = async () => {
      setLoading(true);
      const { data: existingThread } = await supabase
        .from("message_threads")
        .select("id")
        .eq("coach_id", user.id)
        .eq("client_id", clientId)
        .maybeSingle();

      if (cancelled) return;

      if (existingThread) {
        setThreadId(existingThread.id);
      } else {
        const { data: newThread, error } = await supabase
          .from("message_threads")
          .insert({ coach_id: user.id, client_id: clientId })
          .select("id")
          .single();
        if (cancelled) return;
        if (error || !newThread) {
          toast({
            title: "Error",
            description: error?.message || "Could not create thread",
            variant: "destructive",
          });
        } else {
          setThreadId(newThread.id);
        }
      }
      setLoading(false);
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [open, user, clientId, toast]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className={cn(
            // Base
            "fixed z-[70] bg-background border shadow-2xl flex flex-col",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            // Mobile: full-screen takeover
            "inset-0 w-screen h-[100dvh] max-w-none rounded-none",
            // Desktop: centered vertical modal
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2",
            "sm:w-[640px] sm:max-w-[95vw] sm:h-[85vh] sm:rounded-xl",
          )}
          aria-describedby={undefined}
        >
          {/* Header */}
          <div
            className="shrink-0 flex items-center gap-3 px-4 py-3 border-b bg-background"
            style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
          >
            <Avatar className="h-9 w-9 border-2 border-primary/30">
              <AvatarImage src={clientAvatar || undefined} alt={clientName} />
              <AvatarFallback className="text-sm font-bold bg-primary/10 text-primary">
                {(clientName || "C").charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <DialogPrimitive.Title className="text-base font-semibold leading-tight truncate">
                {clientName}
              </DialogPrimitive.Title>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MessageSquare className="h-3 w-3" /> Messages
              </p>
            </div>
            <DialogPrimitive.Close
              className="rounded-full p-2 hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {loading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : threadId ? (
              <ThreadChatView
                threadId={threadId}
                otherUserName={clientName}
                otherUserAvatar={clientAvatar}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Unable to initialize messaging.
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
};

export default MessagesPopup;
