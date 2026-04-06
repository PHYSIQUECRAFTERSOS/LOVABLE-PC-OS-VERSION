import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2, Edit, Check, X } from "lucide-react";

const TIMING_SLOTS = [
  { value: "fasted", label: "☀️ Fasted (Morning)" },
  { value: "meal_1", label: "🍽️ With Meal 1" },
  { value: "meal_2", label: "🍽️ With Meal 2" },
  { value: "pre_workout", label: "💪 Pre-Workout" },
  { value: "post_workout", label: "💪 Post-Workout" },
  { value: "before_bed", label: "🌙 Before Bed" },
  { value: "with_meal", label: "🍽️ Highest Carb Meal" },
  { value: "any_time", label: "⏰ Any Time" },
] as const;

const TIMING_LABEL_MAP: Record<string, string> = Object.fromEntries(
  TIMING_SLOTS.map(t => [t.value, t.label])
);

interface SupplementReviewProps {
  extracted: any;
  matchResults?: any;
  onUpdateExtracted?: (updated: any) => void;
}

const SupplementReview = ({ extracted, matchResults, onUpdateExtracted }: SupplementReviewProps) => {
  const supplements = extracted.supplements || [];
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editData, setEditData] = useState<any>(null);

  const startEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditData({ ...supplements[idx] });
  };

  const saveEdit = () => {
    if (editingIdx === null || !onUpdateExtracted) return;
    const updated = [...supplements];
    updated[editingIdx] = editData;
    onUpdateExtracted({ ...extracted, supplements: updated });
    setEditingIdx(null);
    setEditData(null);
  };

  const removeItem = (idx: number) => {
    if (!onUpdateExtracted) return;
    const updated = supplements.filter((_: any, i: number) => i !== idx);
    onUpdateExtracted({ ...extracted, supplements: updated });
  };

  // Group by timing slot for organized display
  const grouped = TIMING_SLOTS.reduce((acc, slot) => {
    const items = supplements
      .map((s: any, idx: number) => ({ ...s, _idx: idx }))
      .filter((s: any) => s.timing_slot === slot.value);
    if (items.length > 0) acc.push({ slot: slot.value, label: slot.label, items });
    return acc;
  }, [] as { slot: string; label: string; items: any[] }[]);

  // Catch any with unrecognized timing
  const unmapped = supplements
    .map((s: any, idx: number) => ({ ...s, _idx: idx }))
    .filter((s: any) => !TIMING_LABEL_MAP[s.timing_slot]);
  if (unmapped.length > 0) grouped.push({ slot: "unknown", label: "⚠️ Unmapped Timing", items: unmapped });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Supplement Stack — {supplements.length} items
        </h3>
        {extracted.plan_name && (
          <Badge variant="outline" className="text-xs">{extracted.plan_name}</Badge>
        )}
      </div>

      {supplements.length === 0 ? (
        <p className="text-xs text-muted-foreground">No supplements extracted.</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(group => (
            <div key={group.slot}>
              <h4 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">
                {group.label}
              </h4>
              <div className="space-y-1.5">
                {group.items.map((supp: any) => {
                  const idx = supp._idx;
                  const match = matchResults?.supplements?.[supp.name];
                  const isEditing = editingIdx === idx;

                  if (isEditing && editData) {
                    return (
                      <div key={idx} className="p-3 rounded-lg border border-primary/30 bg-card space-y-2">
                        <div className="grid grid-cols-3 gap-2">
                          <Input
                            value={editData.name}
                            onChange={e => setEditData({ ...editData, name: e.target.value })}
                            placeholder="Name"
                            className="h-7 text-xs col-span-1"
                          />
                          <Input
                            value={editData.dosage || ""}
                            onChange={e => setEditData({ ...editData, dosage: e.target.value })}
                            placeholder="Dosage"
                            className="h-7 text-xs"
                          />
                          <Input
                            value={editData.dosage_unit || ""}
                            onChange={e => setEditData({ ...editData, dosage_unit: e.target.value })}
                            placeholder="Unit"
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Select value={editData.timing_slot} onValueChange={v => setEditData({ ...editData, timing_slot: v })}>
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TIMING_SLOTS.map(t => (
                                <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            value={editData.coach_note || ""}
                            onChange={e => setEditData({ ...editData, coach_note: e.target.value })}
                            placeholder="Coach note"
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setEditingIdx(null); setEditData(null); }}>
                            <X className="h-3 w-3 mr-1" /> Cancel
                          </Button>
                          <Button size="sm" className="h-6 text-xs" onClick={saveEdit}>
                            <Check className="h-3 w-3 mr-1" /> Save
                          </Button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={idx} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card group">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">{supp.name}</span>
                          {supp.dosage && (
                            <span className="text-xs text-primary shrink-0">
                              {supp.dosage} {supp.dosage_unit}
                            </span>
                          )}
                        </div>
                        {supp.coach_note && (
                          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{supp.coach_note}</p>
                        )}
                      </div>
                      {match && (
                        <Badge
                          variant="outline"
                          className={`text-[9px] shrink-0 ${
                            match.confidence_level === "green" ? "border-green-500/50 text-green-400" :
                            match.confidence_level === "yellow" ? "border-yellow-500/50 text-yellow-400" :
                            "border-red-500/50 text-red-400"
                          }`}
                        >
                          {match.confidence_level === "green" ? "Matched" :
                           match.confidence_level === "yellow" ? "Partial" : "New"}
                        </Badge>
                      )}
                      {onUpdateExtracted && (
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEdit(idx)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeItem(idx)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SupplementReview;
