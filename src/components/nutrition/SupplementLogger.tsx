import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ClientSupplementPlan from "./ClientSupplementPlan";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Pill, Trash2, Check, Camera, ChevronDown, ChevronUp,
  Shield, Star, Minus, Loader2, AlertTriangle, Sparkles
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MICRONUTRIENTS, BIOAVAILABILITY_FORMS, NutrientInfo } from "@/lib/micronutrients";
import { cn } from "@/lib/utils";
import SupplementScanFlow from "./SupplementScanFlow";

const SupplementLogger = () => {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const isCoach = role === "coach" || role === "admin";
  const [supplements, setSupplements] = useState<any[]>([]);
  const [todayLogs, setTodayLogs] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historyMode, setHistoryMode] = useState<"recent" | "frequent">("recent");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showScanFlow, setShowScanFlow] = useState(false);
  const [hasAssignedPlan, setHasAssignedPlan] = useState<boolean | null>(null);

  const [lookingUp, setLookingUp] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");

  // Add form state
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [servingUnit, setServingUnit] = useState("capsule");
  const [servingSize, setServingSize] = useState("");
  const [nutrients, setNutrients] = useState<Record<string, string>>({});
  const [nutrientForms, setNutrientForms] = useState<Record<string, string>>({});
  const [isVerified, setIsVerified] = useState(false);

  const today = format(new Date(), "yyyy-MM-dd");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Check for assigned plan first
    const { data: assignData } = await supabase
      .from("client_supplement_assignments")
      .select("id")
      .eq("client_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    
    setHasAssignedPlan(!!assignData);

    const [{ data: supps }, { data: logs }] = await Promise.all([
      supabase.from("supplements").select("*").eq("client_id", user.id).eq("is_active", true).order("created_at", { ascending: false }),
      supabase.from("supplement_logs").select("*, supplements(*)").eq("client_id", user.id).eq("logged_at", today),
    ]);
    setSupplements(supps || []);
    setTodayLogs(logs || []);
    setLoading(false);
  }, [user, today]);

  useEffect(() => { load(); }, [load]);

  const lookupBarcode = async (barcode: string) => {
    setLookingUp(true);
    try {
      const { data, error } = await supabase.functions.invoke("barcode-lookup", { body: { barcode } });
      if (error) throw error;
      if (data?.found) {
        setName(data.name || "");
        setBrand(data.brand || "");
        setShowAdd(true);
        toast({ title: "Product found!", description: data.name });
      } else {
        setShowAdd(true);
        toast({ title: "Not found", description: "Enter details manually", variant: "destructive" });
      }
    } catch {
      toast({ title: "Lookup failed", variant: "destructive" });
    } finally {
      setLookingUp(false);
    }
  };

  const handleAddSupplement = async () => {
    if (!user || !name.trim()) return;
    const suppData: any = {
      client_id: user.id,
      name: name.trim(),
      brand: brand.trim() || null,
      serving_unit: servingUnit,
      serving_size: servingSize ? parseInt(servingSize) : null,
      servings_per_container: null,
      is_verified: isCoach ? isVerified : false,
      is_coach_recommended: isCoach,
      coach_id: isCoach ? user.id : null,
      data_source: "manual",
    };
    MICRONUTRIENTS.forEach((n) => {
      const val = parseFloat(nutrients[n.key] || "0");
      if (val > 0) suppData[n.key] = val;
    });
    const { data: inserted, error } = await supabase.from("supplements").insert(suppData).select("id").single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    // Save nutrient forms
    if (inserted) {
      const forms = Object.entries(nutrientForms)
        .filter(([, form]) => form)
        .map(([key, form]) => {
          const formData = BIOAVAILABILITY_FORMS[key]?.find(f => f.form === form);
          return {
            supplement_id: inserted.id,
            nutrient_key: key,
            form_name: form,
            absorption_multiplier: formData?.multiplier || 1.0,
          };
        });
      if (forms.length > 0) {
        await supabase.from("supplement_nutrient_forms").insert(forms);
      }
    }
    toast({ title: "Supplement added" });
    resetForm();
    load();
  };

  const resetForm = () => {
    setShowAdd(false);
    setName(""); setBrand(""); setNutrients({}); setNutrientForms({});
    setServingSize(""); setIsVerified(false);
  };

  const logSupplement = async (supplementId: string, servings: number = 1) => {
    if (!user) return;
    // Find the supplement to use its serving_size as default
    const supp = supplements.find(s => s.id === supplementId);
    const defaultServings = supp?.serving_size || 1;
    const { error } = await supabase.from("supplement_logs").insert({
      client_id: user.id,
      supplement_id: supplementId,
      servings: defaultServings,
      logged_at: today,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Logged ✓" });
      load();
    }
  };

  const updateLogServings = async (logId: string, newServings: number) => {
    if (newServings <= 0) {
      await supabase.from("supplement_logs").delete().eq("id", logId);
    } else {
      await supabase.from("supplement_logs").update({ servings: newServings }).eq("id", logId);
    }
    load();
  };

  const getLogForSupplement = (supplementId: string) =>
    todayLogs.find((l) => l.supplement_id === supplementId);

  // If client has an assigned plan, show the plan view instead
  if (hasAssignedPlan) {
    return <ClientSupplementPlan />;
  }

  return (
    <div className="space-y-5">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
          <Pill className="h-4 w-4 text-primary" />
          Supplements
        </h3>
        <div className="flex items-center gap-2">
          {/* Take Photo Button */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
            onClick={() => setShowScanFlow(true)}
          >
            <Camera className="h-3.5 w-3.5" />
            Take Photo
          </Button>
          <SupplementScanFlow
            open={showScanFlow}
            onOpenChange={setShowScanFlow}
            onSuppAdded={load}
          />
          {/* Manual Add */}
          <Dialog open={showAdd} onOpenChange={(v) => { if (v) setShowAdd(true); else setShowAdd(false); }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-foreground">
                  <Pill className="h-5 w-5 text-primary" />
                  Add Supplement
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-foreground">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="bg-secondary border-border" /></div>
                  <div><Label className="text-foreground">Brand</Label><Input value={brand} onChange={(e) => setBrand(e.target.value)} className="bg-secondary border-border" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-foreground">Serving Unit</Label>
                    <Select value={servingUnit} onValueChange={setServingUnit}>
                      <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["capsule", "tablet", "scoop", "ml", "drop", "serving", "softgel", "lozenge"].map((u) => (
                          <SelectItem key={u} value={u} className="capitalize">{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-foreground">Serving Size</Label>
                    <Input type="number" value={servingSize} onChange={(e) => setServingSize(e.target.value)} className="bg-secondary border-border" placeholder="e.g. 8" />
                    {servingSize && parseInt(servingSize) > 1 && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{servingSize} {servingUnit}s per serving</p>
                    )}
                  </div>
                </div>

                {isCoach && (
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                      <input type="checkbox" checked={isVerified} onChange={(e) => setIsVerified(e.target.checked)} className="accent-primary" />
                      <Shield className="h-3.5 w-3.5 text-primary" />
                      PC Verified
                    </label>
                  </div>
                )}

                <div>
                  <Label className="text-xs text-muted-foreground">Nutrient content per serving</Label>
                  <div className="space-y-2 mt-2 max-h-72 overflow-y-auto pr-1">
                    {MICRONUTRIENTS.filter(n => n.category !== "other").map((n) => (
                      <div key={n.key} className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0"
                            value={nutrients[n.key] || ""}
                            onChange={(e) => setNutrients((p) => ({ ...p, [n.key]: e.target.value }))}
                            className="h-8 text-xs w-20 bg-secondary border-border"
                          />
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-1 truncate" title={n.label}>
                            {n.label} ({n.unit})
                          </span>
                          {BIOAVAILABILITY_FORMS[n.key] && (
                            <Select value={nutrientForms[n.key] || ""} onValueChange={(v) => setNutrientForms(p => ({ ...p, [n.key]: v }))}>
                              <SelectTrigger className="h-7 text-[10px] w-28 bg-secondary border-border"><SelectValue placeholder="Form" /></SelectTrigger>
                              <SelectContent>
                                {BIOAVAILABILITY_FORMS[n.key].map(f => (
                                  <SelectItem key={f.form} value={f.form} className="text-xs">
                                    {f.label} ({Math.round(f.multiplier * 100)}%)
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <Button onClick={handleAddSupplement} disabled={!name.trim()} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                  Save Supplement
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Manual Barcode Input */}
      <div className="flex gap-2">
        <Input
          placeholder="Enter barcode manually..."
          value={manualBarcode}
          onChange={(e) => setManualBarcode(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && manualBarcode.length >= 4) lookupBarcode(manualBarcode); }}
          className="bg-secondary border-border text-sm h-9"
        />
        <Button size="sm" variant="outline" disabled={manualBarcode.length < 4 || lookingUp} onClick={() => lookupBarcode(manualBarcode)} className="h-9">
          {lookingUp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Look Up"}
        </Button>
      </div>

      {/* History Mode Toggle */}
      <div className="flex gap-1 p-0.5 rounded-md bg-secondary w-fit">
        {(["recent", "frequent"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setHistoryMode(mode)}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-sm transition-all capitalize",
              historyMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {mode === "recent" ? "Most Recent" : "Most Frequent"}
          </button>
        ))}
      </div>

      {/* Verified Section */}
      {supplements.filter(s => s.is_verified).length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">PC Verified</span>
          </div>
          {supplements.filter(s => s.is_verified).map((s) => (
            <SupplementCard key={s.id} supplement={s} log={getLogForSupplement(s.id)} onLog={logSupplement} onUpdateServings={updateLogServings} expanded={expandedId === s.id} onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)} />
          ))}
        </div>
      )}

      {/* All Supplements */}
      {supplements.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">No supplements added yet. Take a photo of a label or add manually.</p>
      ) : (
        <div className="space-y-2">
          {supplements.filter(s => !s.is_verified).map((s) => (
            <SupplementCard key={s.id} supplement={s} log={getLogForSupplement(s.id)} onLog={logSupplement} onUpdateServings={updateLogServings} expanded={expandedId === s.id} onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)} />
          ))}
        </div>
      )}
    </div>
  );
};

// Individual supplement card with expand/collapse
interface SupplementCardProps {
  supplement: any;
  log: any;
  onLog: (id: string, servings?: number) => void;
  onUpdateServings: (logId: string, servings: number) => void;
  expanded: boolean;
  onToggle: () => void;
}

const SupplementCard = ({ supplement: s, log, onLog, onUpdateServings, expanded, onToggle }: SupplementCardProps) => {
  const servings = log?.servings || 0;
  const labelServingSize = s.serving_size || 1;
  const unit = s.serving_unit || "serving";

  const nutrientValues = MICRONUTRIENTS.filter(n => n.category !== "other" && (s[n.key] || 0) > 0);

  // Calculate the multiplier: logged quantity / label serving size
  const nutrientMultiplier = servings > 0 ? servings / labelServingSize : 1;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between p-3">
        <button onClick={onToggle} className="flex items-center gap-2 flex-1 text-left">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-foreground truncate">{s.name}</span>
              {s.is_verified && <Shield className="h-3 w-3 text-primary shrink-0" />}
              {s.is_coach_recommended && <Star className="h-3 w-3 text-primary shrink-0" />}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {s.brand ? `${s.brand} · ` : ""}{labelServingSize > 1 ? `${labelServingSize} ${unit}s per serving` : unit}
            </p>
          </div>
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </button>

        {/* Serving Adjuster */}
        <div className="flex items-center gap-1 ml-2">
          {servings > 0 ? (
            <>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onUpdateServings(log.id, servings - 1)}>
                <Minus className="h-3 w-3" />
              </Button>
              <div className="text-center min-w-[3rem]">
                <span className="text-sm font-bold text-primary tabular-nums">{servings}</span>
                {labelServingSize > 1 && (
                  <p className="text-[9px] text-muted-foreground leading-none">of {labelServingSize}</p>
                )}
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onUpdateServings(log.id, servings + 1)}>
                <Plus className="h-3 w-3" />
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => onLog(s.id)} className="h-7 px-3 text-xs border-primary/30 text-primary hover:bg-primary/10">
              <Check className="h-3 w-3 mr-1" />
              Log
            </Button>
          )}
        </div>
      </div>

      {/* Expanded Nutrient Breakdown */}
      {expanded && nutrientValues.length > 0 && (
        <div className="border-t border-border/50 px-3 py-2 bg-secondary/30">
          <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wider">
            {servings > 0
              ? `${servings} of ${labelServingSize} ${unit}${labelServingSize > 1 ? "s" : ""} (${Math.round(nutrientMultiplier * 100)}%)`
              : `Per serving (${labelServingSize} ${unit}${labelServingSize > 1 ? "s" : ""})`
            }
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {nutrientValues.map(n => {
              const labelAmount = s[n.key] || 0;
              const effective = labelAmount * nutrientMultiplier;
              const showScaled = servings > 0 && nutrientMultiplier !== 1;
              return (
                <div key={n.key} className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">{n.label}</span>
                  <div className="flex items-center gap-1">
                    {showScaled && (
                      <span className="text-[9px] text-muted-foreground tabular-nums">{labelAmount.toFixed(1)}→</span>
                    )}
                    <span className="text-foreground font-medium tabular-nums">{effective.toFixed(1)}{n.unit}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {servings > 0 && nutrientMultiplier !== 1 && (
            <p className="text-[9px] text-muted-foreground mt-2 flex items-center gap-1">
              <Sparkles className="h-2.5 w-2.5 text-primary" />
              Scaled to {servings} {unit}{servings !== 1 ? "s" : ""} (label is per {labelServingSize})
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default SupplementLogger;
