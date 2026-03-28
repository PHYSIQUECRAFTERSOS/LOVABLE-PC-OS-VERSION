import { useState, useMemo, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ClientOption {
  id: string;
  name: string;
}

interface SearchableClientSelectProps {
  clients: ClientOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  /** If true, adds a "None (Personal)" option at the top */
  allowNone?: boolean;
  noneLabel?: string;
}

const SearchableClientSelect = ({
  clients,
  value,
  onValueChange,
  placeholder = "Choose a client...",
  allowNone = false,
  noneLabel = "None (Personal)",
}: SearchableClientSelectProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter((c) => c.name.toLowerCase().includes(q));
  }, [clients, search]);

  const selectedName = useMemo(() => {
    if (allowNone && value === "none") return noneLabel;
    return clients.find((c) => c.id === value)?.name || "";
  }, [clients, value, allowNone, noneLabel]);

  useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selectedName && "text-muted-foreground")}>
            {selectedName || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients..."
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {allowNone && (
            <button
              onClick={() => { onValueChange("none"); setOpen(false); }}
              className={cn(
                "flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-muted/50 transition-colors",
                value === "none" && "bg-primary/10 text-primary"
              )}
            >
              <Check className={cn("h-3.5 w-3.5", value === "none" ? "opacity-100" : "opacity-0")} />
              {noneLabel}
            </button>
          )}
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">No clients found</p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => { onValueChange(c.id); setOpen(false); }}
                className={cn(
                  "flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-muted/50 transition-colors",
                  value === c.id && "bg-primary/10 text-primary"
                )}
              >
                <Check className={cn("h-3.5 w-3.5", value === c.id ? "opacity-100" : "opacity-0")} />
                {c.name}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default SearchableClientSelect;
