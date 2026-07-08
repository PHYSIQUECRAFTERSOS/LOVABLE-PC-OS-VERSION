import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Search, MoreVertical, Trash2, ChevronDown, UserX } from "lucide-react";
import { Input } from "@/components/ui/input";
import UserAvatar from "@/components/profile/UserAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useVirtualizer } from "@tanstack/react-virtual";
import DeleteThreadDialog from "./DeleteThreadDialog";

interface Thread {
  id: string;
  client_id: string;
  updated_at: string;
  is_archived: boolean;
  coach_last_seen_at: string | null;
  coach_marked_unread: boolean;
  clientName: string;
  clientAvatar?: string | null;
  lastMessage?: string;
  lastMessageSenderId?: string;
  unreadCount: number;
  inactive: boolean;
}

interface CoachThreadListProps {
  activeThreadId: string | null;
  onSelect: (threadId: string) => void;
}

const CoachThreadList = ({ activeThreadId, onSelect }: CoachThreadListProps) => {
  const { user } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Thread | null>(null);

  // Debounce realtime-triggered refetches so bursts of incoming messages
  // don't cause N repeat scans of every thread.
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchThreads = useCallback(async () => {
    if (!user) return;

    const { data: rawThreads } = await supabase
      .from("message_threads")
      .select(
        "id, client_id, updated_at, is_archived, coach_last_seen_at, coach_marked_unread"
      )
      .eq("coach_id", user.id)
      .eq("is_archived", false)
      .is("coach_hidden_at" as any, null)
      .order("updated_at", { ascending: false });

    if (!rawThreads || rawThreads.length === 0) {
      setThreads([]);
      setLoading(false);
      return;
    }

    const threadIds = rawThreads.map((t) => t.id);
    const clientIds = rawThreads.map((t) => t.client_id);

    // ── Batch #1: profiles + coach_clients status (unchanged) ──
    // ── Batch #2: newest message per thread (single query, we dedupe client-side) ──
    // ── Batch #3: unread messages per thread (single query, we group client-side) ──
    const [
      { data: profiles },
      { data: assignments },
      { data: recentMsgs },
      { data: unreadRows },
    ] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", clientIds),
      supabase
        .from("coach_clients")
        .select("client_id, status")
        .eq("coach_id", user.id)
        .in("client_id", clientIds),
      // Pull recent messages for these threads. We only render the newest per
      // thread so cap the window; ordering DESC lets us keep the first per id.
      supabase
        .from("thread_messages")
        .select("thread_id, content, sender_id, created_at")
        .in("thread_id", threadIds)
        .order("created_at", { ascending: false })
        .limit(Math.max(threadIds.length * 3, 200)),
      // Pull only unread client→coach messages for these threads.
      supabase
        .from("thread_messages")
        .select("thread_id, sender_id, created_at")
        .in("thread_id", threadIds)
        .is("read_at", null),
    ]);

    const nameMap: Record<string, string> = {};
    const avatarMap: Record<string, string | null> = {};
    const profileMap: Record<string, boolean> = {};
    (profiles || []).forEach((p) => {
      nameMap[p.user_id] = p.full_name || "Unnamed Client";
      avatarMap[p.user_id] = p.avatar_url || null;
      profileMap[p.user_id] = true;
    });
    const statusMap: Record<string, string> = {};
    (assignments || []).forEach((a) => {
      statusMap[a.client_id] = a.status;
    });

    // Newest message per thread (data already sorted DESC).
    const lastMsgMap: Record<string, { content: string; sender_id: string }> = {};
    (recentMsgs || []).forEach((m: any) => {
      if (!lastMsgMap[m.thread_id]) {
        lastMsgMap[m.thread_id] = { content: m.content, sender_id: m.sender_id };
      }
    });

    // Group unread rows by thread; caller filters against coach_last_seen_at
    // and client-sender to compute the badge.
    const unreadByThread: Record<string, { sender_id: string; created_at: string }[]> = {};
    (unreadRows || []).forEach((r: any) => {
      (unreadByThread[r.thread_id] ||= []).push({
        sender_id: r.sender_id,
        created_at: r.created_at,
      });
    });

    const enriched: Thread[] = rawThreads.map((thread) => {
      const lastSeen = (thread as any).coach_last_seen_at;
      const markedUnread = (thread as any).coach_marked_unread ?? false;

      const rows = unreadByThread[thread.id] || [];
      let unreadCount = rows.filter((r) => {
        if (r.sender_id !== thread.client_id) return false;
        if (lastSeen && r.created_at <= lastSeen) return false;
        return true;
      }).length;
      if (markedUnread && unreadCount === 0) unreadCount = 1;

      const inactive =
        !profileMap[thread.client_id] || statusMap[thread.client_id] !== "active";

      const last = lastMsgMap[thread.id];
      return {
        id: thread.id,
        client_id: thread.client_id,
        updated_at: thread.updated_at,
        is_archived: thread.is_archived,
        coach_last_seen_at: lastSeen,
        coach_marked_unread: markedUnread,
        clientName: nameMap[thread.client_id] || "Unnamed Client",
        clientAvatar: avatarMap[thread.client_id],
        lastMessage: last?.content,
        lastMessageSenderId: last?.sender_id,
        unreadCount: inactive ? 0 : unreadCount,
        inactive,
      };
    });

    setThreads(enriched);
    setLoading(false);
  }, [user]);

  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => {
      fetchThreads();
    }, 400);
  }, [fetchThreads]);

  useEffect(() => {
    fetchThreads();

    const channel = supabase
      .channel("coach-thread-updates")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "thread_messages" }, () => {
        scheduleRefetch();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "message_threads" }, () => {
        scheduleRefetch();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    };
  }, [fetchThreads, scheduleRefetch]);

  useEffect(() => {
    (window as any).__refetchCoachThreads = fetchThreads;
    return () => {
      delete (window as any).__refetchCoachThreads;
    };
  }, [fetchThreads]);

  const filtered = useMemo(
    () =>
      threads.filter((t) =>
        t.clientName.toLowerCase().includes(search.toLowerCase())
      ),
    [threads, search]
  );
  const activeList = useMemo(() => filtered.filter((t) => !t.inactive), [filtered]);
  const inactiveList = useMemo(() => filtered.filter((t) => t.inactive), [filtered]);

  // Virtualize the active list (the bulk of rows).
  const scrollParentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: activeList.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 68,
    overscan: 8,
  });

  const ThreadRow = ({ thread, style }: { thread: Thread; style?: React.CSSProperties }) => (
    <div
      style={style}
      className={cn(
        "group relative flex w-full items-start gap-3 rounded-lg px-3 py-3 transition-colors",
        activeThreadId === thread.id ? "bg-primary/10" : "hover:bg-secondary",
        thread.inactive && "opacity-60"
      )}
    >
      <button
        onClick={() => onSelect(thread.id)}
        className="flex flex-1 items-start gap-3 text-left min-w-0"
      >
        <UserAvatar
          src={thread.clientAvatar}
          name={thread.clientName}
          size="list"
          className="h-9 w-9 text-xs mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "text-sm truncate",
                thread.unreadCount > 0 ? "font-bold text-foreground" : "font-medium text-foreground"
              )}
            >
              {thread.clientName}
              {thread.inactive && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground align-middle">
                  <UserX className="h-2.5 w-2.5" />
                  Inactive
                </span>
              )}
            </span>
            {thread.unreadCount > 0 &&
              (thread.coach_marked_unread && thread.unreadCount === 1 ? (
                <span className="ml-2 h-2.5 w-2.5 rounded-full bg-primary shrink-0" />
              ) : (
                <span className="ml-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                  {thread.unreadCount}
                </span>
              ))}
          </div>
          {thread.lastMessage && (
            <p
              className={cn(
                "text-xs truncate mt-0.5",
                thread.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"
              )}
            >
              {thread.lastMessage}
            </p>
          )}
        </div>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-opacity"
            onClick={(e) => e.stopPropagation()}
            aria-label="Conversation menu"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setPendingDelete(thread)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete conversation
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const empty = activeList.length === 0 && inactiveList.length === 0;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients..."
            className="pl-9 h-10 bg-secondary border-none text-[15px]"
          />
        </div>
      </div>

      <div ref={scrollParentRef} className="flex-1 overflow-y-auto px-2">
        {empty && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {search ? "No matching clients" : "No active client threads"}
          </p>
        )}

        {/* Virtualized active threads */}
        {activeList.length > 0 && (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((vi) => {
              const thread = activeList[vi.index];
              return (
                <ThreadRow
                  key={thread.id}
                  thread={thread}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vi.start}px)`,
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Inactive section — usually short, render normally */}
        {inactiveList.length > 0 && (
          <div className="mt-4 space-y-0.5">
            <button
              onClick={() => setShowInactive((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              <span className="flex items-center gap-1.5">
                <UserX className="h-3.5 w-3.5" />
                Inactive ({inactiveList.length})
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  showInactive && "rotate-180"
                )}
              />
            </button>
            {showInactive && inactiveList.map((thread) => (
              <ThreadRow key={thread.id} thread={thread} />
            ))}
          </div>
        )}
      </div>

      {pendingDelete && (
        <DeleteThreadDialog
          open={!!pendingDelete}
          onOpenChange={(v) => !v && setPendingDelete(null)}
          threadId={pendingDelete.id}
          clientName={pendingDelete.clientName}
          onDeleted={() => {
            setPendingDelete(null);
            fetchThreads();
          }}
        />
      )}
    </div>
  );
};

export default CoachThreadList;
