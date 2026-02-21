import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { MessageSquare, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow } from "date-fns";
import UserAvatar from "@/components/profile/UserAvatar";

interface Thread {
  id: string;
  client_id: string;
  updated_at: string;
  is_archived: boolean;
  clientName: string;
  clientAvatar?: string | null;
  lastMessage?: string;
  unreadCount: number;
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

  const fetchThreads = async () => {
    if (!user) return;

    const { data: rawThreads } = await supabase
      .from("message_threads")
      .select("*")
      .eq("coach_id", user.id)
      .eq("is_archived", false)
      .order("updated_at", { ascending: false });

    if (!rawThreads || rawThreads.length === 0) {
      setThreads([]);
      setLoading(false);
      return;
    }

    const clientIds = rawThreads.map(t => t.client_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, avatar_url")
      .in("user_id", clientIds);

    const nameMap: Record<string, string> = {};
    const avatarMap: Record<string, string | null> = {};
    (profiles || []).forEach(p => {
      nameMap[p.user_id] = p.full_name || "Unnamed Client";
      avatarMap[p.user_id] = p.avatar_url || null;
    });

    const enriched = await Promise.all(rawThreads.map(async (thread) => {
      // Last message
      const { data: lastMsg } = await supabase
        .from("thread_messages")
        .select("content, created_at")
        .eq("thread_id", thread.id)
        .order("created_at", { ascending: false })
        .limit(1);

      // Unread count (messages from client that coach hasn't read)
      const { count } = await supabase
        .from("thread_messages")
        .select("id", { count: "exact", head: true })
        .eq("thread_id", thread.id)
        .neq("sender_id", user.id)
        .is("read_at", null);

      return {
        id: thread.id,
        client_id: thread.client_id,
        updated_at: thread.updated_at,
        is_archived: thread.is_archived,
        clientName: nameMap[thread.client_id] || "Unnamed Client",
        clientAvatar: avatarMap[thread.client_id],
        lastMessage: lastMsg?.[0]?.content,
        unreadCount: count || 0,
      };
    }));

    setThreads(enriched);
    setLoading(false);
  };

  useEffect(() => {
    fetchThreads();

    const channel = supabase
      .channel("coach-thread-updates")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "thread_messages" }, () => {
        fetchThreads();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const filtered = threads.filter(t =>
    t.clientName.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients..."
            className="pl-9 h-9 bg-secondary border-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-0.5 px-2">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {search ? "No matching clients" : "No active client threads"}
          </p>
        )}
        {filtered.map((thread) => (
          <button
            key={thread.id}
            onClick={() => onSelect(thread.id)}
            className={cn(
              "flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors",
              activeThreadId === thread.id ? "bg-primary/10" : "hover:bg-secondary"
            )}
          >
            <UserAvatar
              src={thread.clientAvatar}
              name={thread.clientName}
              className="h-9 w-9 text-xs mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground truncate">
                  {thread.clientName}
                </span>
                {thread.unreadCount > 0 && (
                  <span className="ml-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                    {thread.unreadCount}
                  </span>
                )}
              </div>
              {thread.lastMessage && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {thread.lastMessage}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default CoachThreadList;
