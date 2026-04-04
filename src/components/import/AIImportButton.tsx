import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import AIImportModal from "./AIImportModal";

interface AIImportButtonProps {
  entryPoint: "library" | "client";
  clientId?: string;
  importType: "workout" | "meal" | "supplement" | "any";
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}

const AIImportButton = ({
  entryPoint,
  clientId,
  importType,
  variant = "outline",
  size = "sm",
}: AIImportButtonProps) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setOpen(true)}
        className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
      >
        <Sparkles className="h-3.5 w-3.5" />
        AI Import
      </Button>
      <AIImportModal
        open={open}
        onOpenChange={setOpen}
        entryPoint={entryPoint}
        clientId={clientId}
        importType={importType}
      />
    </>
  );
};

export default AIImportButton;
