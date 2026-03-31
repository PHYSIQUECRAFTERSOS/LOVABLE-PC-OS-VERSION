import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getLocalDateString } from "@/utils/localDate";

interface Client {
  user_id: string;
  full_name: string | null;
}

const MacroTargetEditor = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [calories, setCalories] = useState("2000");
  const [protein, setProtein] = useState("150");
  const [carbs, setCarbs] = useState("200");
  const [fat, setFat] = useState("70");
  const [isRefeed, setIsRefeed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchClients = async () => {
      const { data } = await supabase
        .from("coach_clients")
        .select("client_id")
        .eq("coach_id", user.id)
        .eq("status", "active");

      if (data && data.length > 0) {
        const clientIds = data.map(d => d.client_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", clientIds);
        setClients((profiles as Client[]) || []);
      }
    };
    fetchClients();
  }, [user]);

  const loadExisting = async (clientId: string) => {
    setSelectedClient(clientId);
    const { data } = await supabase
      .from("nutrition_targets")
      .select("*")
      .eq("client_id", clientId)
      .order("effective_date", { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      setCalories(String(data[0].calories));
      setProtein(String(data[0].protein));
      setCarbs(String(data[0].carbs));
      setFat(String(data[0].fat));
      setIsRefeed(data[0].is_refeed);
    }
  };

  const handleSave = async () => {
    if (!user || !selectedClient) return;
    setLoading(true);
    const today = getLocalDateString();
    const { error } = await supabase.from("nutrition_targets").upsert({
      client_id: selectedClient,
      coach_id: user.id,
      calories: parseInt(calories) || 2000,
      protein: parseInt(protein) || 150,
      carbs: parseInt(carbs) || 200,
      fat: parseInt(fat) || 70,
      is_refeed: isRefeed,
      effective_date: today,
    }, { onConflict: "client_id,effective_date" });
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Macro targets updated!" });
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Settings2 className="h-4 w-4" /> Set Client Macros
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set Macro Targets</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Client</Label>
            <Select value={selectedClient} onValueChange={loadExisting}>
              <SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.user_id} value={c.user_id}>
                    {c.full_name || "Unnamed Client"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><Label>Calories</Label><Input type="number" value={calories} onChange={(e) => setCalories(e.target.value)} /></div>
            <div><Label>Protein (g)</Label><Input type="number" value={protein} onChange={(e) => setProtein(e.target.value)} /></div>
            <div><Label>Carbs (g)</Label><Input type="number" value={carbs} onChange={(e) => setCarbs(e.target.value)} /></div>
            <div><Label>Fat (g)</Label><Input type="number" value={fat} onChange={(e) => setFat(e.target.value)} /></div>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={isRefeed} onCheckedChange={setIsRefeed} />
            <Label>Refeed / High Day</Label>
          </div>

          <Button onClick={handleSave} disabled={loading || !selectedClient} className="w-full">
            {loading ? "Saving..." : "Save Targets"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MacroTargetEditor;
