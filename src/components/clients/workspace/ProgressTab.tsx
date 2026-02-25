import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Camera } from "lucide-react";
import { format } from "date-fns";

const ClientWorkspaceProgress = ({ clientId }: { clientId: string }) => {
  const [measurements, setMeasurements] = useState<any[]>([]);
  const [photoCount, setPhotoCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [measRes, photoRes] = await Promise.all([
        supabase
          .from("body_measurements")
          .select("*")
          .eq("client_id", clientId)
          .order("measured_at", { ascending: false })
          .limit(5),
        supabase
          .from("progress_photos")
          .select("id", { count: "exact", head: true })
          .eq("client_id", clientId),
      ]);
      setMeasurements(measRes.data || []);
      setPhotoCount(photoRes.count || 0);
      setLoading(false);
    };
    load();
  }, [clientId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-[200px] rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="pt-5 pb-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Progress Photos</p>
              <p className="text-2xl font-bold mt-1">{photoCount}</p>
            </div>
            <Camera className="h-8 w-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Measurements Logged</p>
              <p className="text-2xl font-bold mt-1">{measurements.length}</p>
            </div>
            <BarChart3 className="h-8 w-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
      </div>

      {measurements.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Recent Measurements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {measurements.map((m: any) => (
                <div key={m.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <span className="text-sm text-muted-foreground">
                    {format(new Date(m.measured_at), "MMM d, yyyy")}
                  </span>
                  <div className="flex gap-2">
                    {m.waist && <Badge variant="outline" className="text-[10px]">Waist: {m.waist}"</Badge>}
                    {m.chest && <Badge variant="outline" className="text-[10px]">Chest: {m.chest}"</Badge>}
                    {m.body_fat_pct && <Badge variant="secondary" className="text-[10px]">BF: {m.body_fat_pct}%</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ClientWorkspaceProgress;
