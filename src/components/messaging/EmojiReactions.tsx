import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const REACTION_EMOJIS = ["👍", "💪", "🥲", "🔥", "💯"];

interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
}

interface EmojiReactionsProps {
  messageId: string;
  reactions: Reaction[];
  onReactionsChange: (messageId: string, reactions: Reaction[]) => void;
}

const EmojiReactions = ({ messageId, reactions, onReactionsChange }: EmojiReactionsProps) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const grouped = reactions.reduce<Record<string, { count: number; mine: boolean; ids: string[] }>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, mine: false, ids: [] };
    acc[r.emoji].count++;
    acc[r.emoji].ids.push(r.id);
    if (r.user_id === user?.id) acc[r.emoji].mine = true;
    return acc;
  }, {});

  const toggleReaction = async (emoji: string) => {
    if (!user) return;
    setOpen(false);

    const existing = reactions.find(r => r.emoji === emoji && r.user_id === user.id);
    if (existing) {
      // Optimistic remove
      onReactionsChange(messageId, reactions.filter(r => r.id !== existing.id));
      await supabase.from("message_reactions").delete().eq("id", existing.id);
    } else {
      // Optimistic add
      const tempId = crypto.randomUUID();
      const optimistic: Reaction = { id: tempId, message_id: messageId, user_id: user.id, emoji };
      onReactionsChange(messageId, [...reactions, optimistic]);
      const { data } = await supabase
        .from("message_reactions")
        .insert({ message_id: messageId, user_id: user.id, emoji })
        .select("id")
        .single();
      if (data) {
        onReactionsChange(messageId, reactions.filter(r => r.id !== tempId).concat({ ...optimistic, id: data.id }));
      }
    }
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* Existing reactions */}
      {Object.entries(grouped).map(([emoji, { count, mine }]) => (
        <button
          key={emoji}
          onClick={() => toggleReaction(emoji)}
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs border transition-colors",
            mine
              ? "bg-primary/20 border-primary/40 text-foreground"
              : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
          )}
        >
          <span>{emoji}</span>
          {count > 1 && <span className="text-[10px]">{count}</span>}
        </button>
      ))}

      {/* Add reaction popover */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="inline-flex items-center justify-center rounded-full h-5 w-5 text-[10px] border border-border text-muted-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100">
            +
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" className="w-auto p-1.5 flex gap-1" sideOffset={4}>
          {REACTION_EMOJIS.map(emoji => (
            <button
              key={emoji}
              onClick={() => toggleReaction(emoji)}
              className="text-lg hover:scale-125 transition-transform p-1"
            >
              {emoji}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default EmojiReactions;
