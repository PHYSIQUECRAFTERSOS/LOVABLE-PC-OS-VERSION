import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, Search, CheckSquare, Square, MessageSquare, Zap, Loader2 } from "lucide-react";
import { subDays, format } from "date-fns";

export interface SelectableClient {
  id: string;
  name: string;
  avatar_url?: string;
  compliance: number;
  streak: number;
  tags: string[];
}

interface SelectableClientCardsProps {
  onSelectionChange: (selected: SelectableClient[]) => void;
  onSendMessage: () => void;
}

const SelectableClientCards = ({ onSelectionChange, onSendMessage }: SelectableClientCardsProps) => {
  const { user } = useAuth();
  const [clients, setClients] = useState<SelectableClient[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchClients = async () => {
      setLoading(true);
      const { data: assignments } = await supabase
        .from("coach_clients")
        .select("client_id")
        .eq("coach_id", user.id)
        .eq("status", "active");

      if (!assignments?.length) {
        setClients([]);
        setLoading(false);
        return;
      }

      const clientIds = assignments.map((a) => a.client_id);

      const [profilesRes, tagsRes] = await Promise.all([
        supabase.from("profiles").select("*").in("user_id", clientIds),
        supabase.from("client_tags").select("client_id, tag").in("client_id", clientIds),
      ]);

      const tagMap: Record<string, string[]> = {};
      (tagsRes.data || []).forEach((t) => {
        if (!tagMap[t.client_id]) tagMap[t.client_id] = [];
        tagMap[t.client_id].push(t.tag);
      });

      const last7Days = Array.from({ length: 7 }, (_, i) =>
        format(subDays(new Date(), i), "yyyy-MM-dd")
      ).reverse();

      const clientsData = await Promise.all(
        (profilesRes.data || []).map(async (p) => {
          const { data: sessions } = await supabase
            .from("workout_sessions")
            .select("created_at, completed_at")
            .eq("client_id", p.user_id)
            .gte("created_at", `${last7Days[0]}T00:00:00`);

          const completed = (sessions || []).filter((s) => s.completed_at).length;
          const compliance = Math.round(
            (completed / Math.max((sessions || []).length, 1)) * 100
          );

          let streak = 0;
          for (let i = 6; i >= 0; i--) {
            const dayComplete = (sessions || []).some(
              (s) =>
                format(new Date(s.created_at), "yyyy-MM-dd") === last7Days[i] &&
                s.completed_at
            );
            if (dayComplete) streak++;
            else break;
          }

          return {
            id: p.user_id,
            name: p.full_name || "Client",
            avatar_url: p.avatar_url,
            compliance,
            streak,
            tags: tagMap[p.user_id] || [],
          };
        })
      );

      setClients(clientsData);
      setLoading(false);
    };
    fetchClients();
  }, [user]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    clients.forEach((c) => c.tags.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [clients]);

  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (tagFilter !== "all" && !c.tags.includes(tagFilter)) return false;
      if (statusFilter === "high_compliance" && c.compliance < 70) return false;
      if (statusFilter === "low_compliance" && c.compliance >= 70) return false;
      return true;
    });
  }, [clients, search, statusFilter, tagFilter]);

  useEffect(() => {
    const selected = clients.filter((c) => selectedIds.has(c.id));
    onSelectionChange(selected);
  }, [selectedIds, clients]);

  const toggleAll = () => {
    const filteredIds = filteredClients.map((c) => c.id);
    const allSelected = filteredIds.every((id) => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allSelected) {
      filteredIds.forEach((id) => next.delete(id));
    } else {
      filteredIds.forEach((id) => next.add(id));
    }
    setSelectedIds(next);
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const allFilteredSelected =
    filteredClients.length > 0 &&
    filteredClients.every((c) => selectedIds.has(c.id));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No active clients assigned</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <Button
            variant={allFilteredSelected ? "default" : "outline"}
            size="sm"
            onClick={toggleAll}
            className="gap-2"
          >
            {allFilteredSelected ? (
              <CheckSquare className="h-3.5 w-3.5" />
            ) : (
              <Square className="h-3.5 w-3.5" />
            )}
            {allFilteredSelected ? "Deselect All" : "Select All"}
          </Button>

          {selectedIds.size > 0 && (
            <Button size="sm" onClick={onSendMessage} className="gap-2">
              <MessageSquare className="h-3.5 w-3.5" />
              Send Message ({selectedIds.size})
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial sm:w-48">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[140px] text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              <SelectItem value="high_compliance">High Compliance</SelectItem>
              <SelectItem value="low_compliance">Low Compliance</SelectItem>
            </SelectContent>
          </Select>

          {allTags.length > 0 && (
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger className="h-9 w-[140px] text-sm">
                <SelectValue placeholder="Tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tags</SelectItem>
                {allTags.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Selection count */}
      {selectedIds.size > 0 && (
        <div className="text-xs text-muted-foreground">
          {selectedIds.size} of {clients.length} clients selected
        </div>
      )}

      {/* Client grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredClients.map((client) => {
          const isSelected = selectedIds.has(client.id);
          return (
            <Card
              key={client.id}
              className={`cursor-pointer transition-all ${
                isSelected
                  ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                  : "hover:border-primary/20"
              }`}
              onClick={() => toggleOne(client.id)}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleOne(client.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0"
                  />
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={client.avatar_url} alt={client.name} />
                    <AvatarFallback className="text-xs">
                      {client.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground text-sm truncate">
                      {client.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {client.compliance}% compliance
                      </span>
                      {client.streak > 0 && (
                        <span className="text-xs text-primary font-medium flex items-center gap-0.5">
                          <Zap className="h-2.5 w-2.5" />
                          {client.streak}d
                        </span>
                      )}
                    </div>
                  </div>
                  {client.tags.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {client.tags[0]}
                      {client.tags.length > 1 && ` +${client.tags.length - 1}`}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredClients.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No clients match your filters.
        </p>
      )}
    </div>
  );
};

export default SelectableClientCards;
