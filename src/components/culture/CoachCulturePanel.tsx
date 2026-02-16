import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Crown, ArrowUp, RotateCcw, Send, Megaphone, Sparkles } from "lucide-react";
import {
  useAllClients,
  useSetSpotlight,
  useCreateCultureMessage,
  useActiveSpotlights,
  useCultureMessages,
} from "@/hooks/useCulture";
import { toast } from "sonner";

const CoachCulturePanel = () => {
  const { data: clients, isLoading: clientsLoading } = useAllClients();
  const { data: spotlights } = useActiveSpotlights();
  const { data: messages } = useCultureMessages();
  const setSpotlight = useSetSpotlight();
  const createMessage = useCreateCultureMessage();

  const [spotlightType, setSpotlightType] = useState("high_performer");
  const [selectedClient, setSelectedClient] = useState("");
  const [spotlightMessage, setSpotlightMessage] = useState("");
  const [cultureMsg, setCultureMsg] = useState("");
  const [pinMessage, setPinMessage] = useState(false);

  const handleSpotlight = () => {
    if (!selectedClient) return;
    setSpotlight.mutate(
      { userId: selectedClient, spotlightType, message: spotlightMessage || undefined },
      {
        onSuccess: () => {
          toast.success("Spotlight set!");
          setSelectedClient("");
          setSpotlightMessage("");
        },
      }
    );
  };

  const handleCultureMessage = () => {
    if (!cultureMsg.trim()) return;
    createMessage.mutate(
      { content: cultureMsg.trim(), isPinned: pinMessage },
      {
        onSuccess: () => {
          toast.success("Culture message posted");
          setCultureMsg("");
          setPinMessage(false);
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      {/* Weekly Spotlight Selector */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Weekly Spotlights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Current spotlights */}
          {(spotlights || []).length > 0 && (
            <div className="space-y-1.5 mb-3">
              {(spotlights || []).map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-xs p-2 rounded bg-secondary/50">
                  <span className="text-primary font-semibold">
                    {s.spotlight_type === "high_performer" ? "🏆" : s.spotlight_type === "most_improved" ? "📈" : "🔄"}
                  </span>
                  <span className="text-foreground">{s.full_name}</span>
                </div>
              ))}
            </div>
          )}

          <Select value={spotlightType} onValueChange={setSpotlightType}>
            <SelectTrigger className="bg-secondary/30 border-0 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high_performer">
                <span className="flex items-center gap-2"><Crown className="h-3.5 w-3.5" /> High Performer</span>
              </SelectItem>
              <SelectItem value="most_improved">
                <span className="flex items-center gap-2"><ArrowUp className="h-3.5 w-3.5" /> Most Improved</span>
              </SelectItem>
              <SelectItem value="comeback">
                <span className="flex items-center gap-2"><RotateCcw className="h-3.5 w-3.5" /> Comeback</span>
              </SelectItem>
            </SelectContent>
          </Select>

          {clientsLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger className="bg-secondary/30 border-0 h-9">
                <SelectValue placeholder="Select member..." />
              </SelectTrigger>
              <SelectContent>
                {(clients || []).map((c) => (
                  <SelectItem key={c.user_id} value={c.user_id}>
                    <span className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        {c.avatar_url && <AvatarImage src={c.avatar_url} />}
                        <AvatarFallback className="text-[8px] bg-secondary">{(c.full_name || "U")[0]}</AvatarFallback>
                      </Avatar>
                      {c.full_name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Input
            placeholder="Optional spotlight message..."
            value={spotlightMessage}
            onChange={(e) => setSpotlightMessage(e.target.value)}
            className="h-9 bg-secondary/30 border-0 text-sm"
          />

          <Button
            size="sm"
            onClick={handleSpotlight}
            disabled={!selectedClient || setSpotlight.isPending}
            className="w-full"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Set Spotlight
          </Button>
        </CardContent>
      </Card>

      {/* Culture Message */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" />
            Weekly Culture Message
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Write a motivating culture message for the week..."
            value={cultureMsg}
            onChange={(e) => setCultureMsg(e.target.value)}
            className="min-h-[80px] resize-none bg-secondary/30 border-0 focus-visible:ring-1"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch id="pin-msg" checked={pinMessage} onCheckedChange={setPinMessage} />
              <Label htmlFor="pin-msg" className="text-xs text-muted-foreground">Pin above leaderboard</Label>
            </div>
            <Button
              size="sm"
              onClick={handleCultureMessage}
              disabled={!cultureMsg.trim() || createMessage.isPending}
            >
              <Send className="h-3.5 w-3.5 mr-1" /> Post
            </Button>
          </div>

          {/* Recent messages */}
          {(messages || []).length > 0 && (
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Recent</p>
              {(messages || []).slice(0, 3).map((m: any) => (
                <div key={m.id} className="text-xs text-muted-foreground p-2 rounded bg-secondary/30 flex items-start gap-2">
                  {m.is_pinned && <Megaphone className="h-3 w-3 text-primary mt-0.5 shrink-0" />}
                  <p className="line-clamp-2">{m.content}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CoachCulturePanel;
